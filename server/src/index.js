// Nomos API — a Cloudflare Worker backed by D1.
//
//   /api/*   this Worker (sync, linking phones, Web Push)
//   /*       the phone app (static files in public/, served by Cloudflare)
//
// Every /api route except /api/health and /api/pair/claim needs
// `Authorization: Bearer <token>`: the master token (the PC) or a device token
// (a linked phone). See README.md.
import { CORS, HttpError, fail, json, kvDelete, kvGet, kvSet, randomToken, readJson, sha256Hex } from './http.js'
import { authenticate, touch } from './auth.js'
import { currentSeq, pull, push } from './docs.js'
import { pushToDevices, vapidKeys } from './webpush.js'
import { runReminders } from './reminders.js'

const VERSION = 2
const PAIR_TTL_MS = 10 * 60 * 1000
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
const NOTIFY = ['always', 'away', 'never']

const needDb = (env) => {
  if (!env.DB) throw new HttpError(500, 'El servidor no tiene base de datos (binding DB).')
  return env.DB
}
const ownerOnly = (who) => {
  if (who.role !== 'owner') throw new HttpError(403, 'Solo Nomos en tu PC puede hacer esto.')
}
const deviceOnly = (who) => {
  if (who.role !== 'device') throw new HttpError(403, 'Esto es solo para un celular vinculado.')
}

const publicDevice = (d, pushCount = 0) => ({
  id: d.id,
  name: d.name,
  notify: d.notify,
  createdAt: d.created_at,
  lastSeen: d.last_seen,
  push: pushCount > 0
})

// ---------------------------------------------------------------------------
// Linking a phone: the PC asks for a short code, the phone trades it for a token.

function newPairCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const s = [...bytes].map((b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}
const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

async function pairStart(db) {
  const code = newPairCode()
  const expiresAt = Date.now() + PAIR_TTL_MS
  await kvSet(db, 'pairing', { code: cleanCode(code), expiresAt })
  return { ok: true, code, expiresAt }
}

async function pairClaim(db, body) {
  const pending = await kvGet(db, 'pairing')
  const code = cleanCode(body?.code)
  if (!pending || !code || pending.code !== code || Date.now() > pending.expiresAt) {
    throw new HttpError(400, 'El código no es válido o ya venció. Pide uno nuevo en Nomos en tu PC.')
  }
  await kvDelete(db, 'pairing') // single use
  const token = randomToken()
  const device = {
    id: crypto.randomUUID(),
    name: String(body?.name ?? '').trim().slice(0, 40) || 'Celular',
    created_at: Date.now()
  }
  await db
    .prepare(`INSERT INTO devices (id, name, token_hash, notify, created_at) VALUES (?1, ?2, ?3, 'always', ?4)`)
    .bind(device.id, device.name, await sha256Hex(token), device.created_at)
    .run()
  return { ok: true, token, device: publicDevice({ ...device, notify: 'always', last_seen: null }) }
}

async function listDevices(db) {
  const { results } = await db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM push_subs s WHERE s.device_id = d.id) AS subs
       FROM devices d ORDER BY d.created_at`
    )
    .all()
  return { ok: true, devices: results.map((d) => publicDevice(d, d.subs)) }
}

async function removeDevice(db, id) {
  await db.batch([
    db.prepare('DELETE FROM push_subs WHERE device_id = ?1').bind(id),
    db.prepare('DELETE FROM devices WHERE id = ?1').bind(id)
  ])
  return { ok: true }
}

async function deviceInfo(db, device) {
  const subs = await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE device_id = ?1').bind(device.id).first('n')
  return { ok: true, device: publicDevice(device, subs) }
}

async function updateDevice(db, device, body) {
  const notify = NOTIFY.includes(body?.notify) ? body.notify : device.notify
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : device.name
  await db.prepare('UPDATE devices SET notify = ?1, name = ?2 WHERE id = ?3').bind(notify, name, device.id).run()
  return deviceInfo(db, { ...device, notify, name })
}

// ---------------------------------------------------------------------------
// Web Push subscriptions

async function subscribe(db, device, body, origin, testMode = false) {
  const endpoint = String(body?.endpoint ?? '')
  const p256dh = String(body?.keys?.p256dh ?? '')
  const auth = String(body?.keys?.auth ?? '')
  const allowed = /^https:\/\//.test(endpoint) || (testMode && /^http:\/\/127\.0\.0\.1[:/]/.test(endpoint))
  if (!allowed || endpoint.length > 1000 || !p256dh || !auth) {
    throw new HttpError(400, 'Suscripción inválida.')
  }
  await db
    .prepare(
      `INSERT INTO push_subs (endpoint, device_id, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .bind(endpoint, device.id, p256dh, auth, Date.now())
    .run()
  // The VAPID "sub" claim: this server's public address.
  if (/^https:\/\//.test(origin)) await kvSet(db, 'origin', origin)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Router

async function route(request, env) {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (pathname === '/api/health' && method === 'GET') return json({ ok: true, app: 'nomos', version: VERSION })
  if (pathname === '/api/pair/claim' && method === 'POST') return json(await pairClaim(needDb(env), await readJson(request)))
  if (!pathname.startsWith('/api/')) return fail(404, 'No encontrado.')

  const who = await authenticate(request, env)
  if (!who) return fail(401, 'Token incorrecto.')
  const db = needDb(env)
  await touch(env, who)

  if (pathname === '/api/me' && method === 'GET') {
    return json({ ok: true, app: 'nomos', version: VERSION, role: who.role, seq: await currentSeq(db) })
  }

  // Sync
  if (pathname === '/api/sync' && method === 'GET') return json(await pull(db, url))
  if (pathname === '/api/sync' && method === 'POST') {
    const body = await readJson(request)
    const device = who.role === 'device' ? `phone:${who.device.id}` : body?.device
    return json(await push(db, { ...body, device }))
  }

  // Linking phones (PC only)
  if (pathname === '/api/pair/start' && method === 'POST') {
    ownerOnly(who)
    return json(await pairStart(db))
  }
  if (pathname === '/api/devices' && method === 'GET') {
    ownerOnly(who)
    return json(await listDevices(db))
  }
  const del = pathname.match(/^\/api\/devices\/([\w-]{1,64})$/)
  if (del && method === 'DELETE') {
    ownerOnly(who)
    return json(await removeDevice(db, del[1]))
  }

  // This phone
  if (pathname === '/api/device' && method === 'GET') {
    deviceOnly(who)
    return json(await deviceInfo(db, who.device))
  }
  if (pathname === '/api/device' && method === 'PATCH') {
    deviceOnly(who)
    return json(await updateDevice(db, who.device, await readJson(request)))
  }
  if (pathname === '/api/device' && method === 'DELETE') {
    deviceOnly(who)
    return json(await removeDevice(db, who.device.id))
  }

  // Notifications
  if (pathname === '/api/push/key' && method === 'GET') return json({ ok: true, publicKey: (await vapidKeys(db)).publicKey })
  if (pathname === '/api/push/subscribe' && method === 'POST') {
    deviceOnly(who)
    return json(await subscribe(db, who.device, await readJson(request), url.origin, env.NOMOS_TEST === '1'))
  }
  if (pathname === '/api/push/subscribe' && method === 'DELETE') {
    deviceOnly(who)
    const body = await readJson(request)
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ?1 AND device_id = ?2').bind(String(body?.endpoint ?? ''), who.device.id).run()
    return json({ ok: true })
  }
  if (pathname === '/api/push/test' && method === 'POST') {
    deviceOnly(who)
    const sent = await pushToDevices(env, [who.device.id], {
      title: '🌱 Nomos',
      body: 'Así te llegarán los recordatorios de tus hábitos.',
      tag: 'test',
      url: '/'
    })
    return json({ ok: true, sent })
  }

  // Test only: run the reminder cron at a given time.
  if (pathname === '/api/_test/reminders' && method === 'POST' && env.NOMOS_TEST === '1') {
    return json({ ok: true, ...(await runReminders(env, Number(url.searchParams.get('now')) || Date.now())) })
  }

  return fail(404, 'No encontrado.')
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message)
      console.error(err)
      return fail(500, 'Error interno.')
    }
  },
  async scheduled(_event, env, ctx) {
    if (!env.DB) return
    ctx.waitUntil(
      runReminders(env).catch((err) => {
        console.error(`reminders: ${String(err)}`)
      })
    )
  }
}
