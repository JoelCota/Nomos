// Phase 2: linking phones, device tokens, Web Push and server-side reminders.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto'
import ece from 'http_ece'
import { startLocalServer } from './local-server.js'

const OWNER = 'owner-token'
let server
let receiver
const inbox = [] // pushes received: { path, headers, payload }

// A fake push service with a real browser-like key pair, so we can decrypt.
const ua = createECDH('prime256v1')
ua.generateKeys()
const uaAuth = randomBytes(16)
const b64u = (buf) => Buffer.from(buf).toString('base64url')

before(async () => {
  receiver = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      let payload = null
      try {
        payload = JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: ua, authSecret: uaAuth }).toString())
      } catch (err) {
        payload = { error: String(err) }
      }
      inbox.push({ path: req.url, headers: req.headers, payload })
      res.statusCode = req.url.includes('gone') ? 410 : 201
      res.end()
    })
  })
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r))
  server = await startLocalServer({ token: OWNER })
})
after(() => {
  server?.stop()
  receiver?.close()
})

const call = async (method, path, body, token = OWNER) => {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { status: res.status, body: await res.json() }
}

let phone // { token, device }

test('linking a phone with a one-time code', async () => {
  assert.equal((await call('POST', '/api/pair/claim', { code: 'AAAA-BBBB' }, null)).status, 400, 'no code issued yet')
  const start = await call('POST', '/api/pair/start')
  assert.equal(start.status, 200)
  assert.match(start.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal((await call('POST', '/api/pair/claim', { code: 'ZZZZ-ZZZZ' }, null)).status, 400, 'wrong code')

  const claim = await call('POST', '/api/pair/claim', { code: start.body.code.toLowerCase().replace('-', ' '), name: 'iPhone de prueba' }, null)
  assert.equal(claim.status, 200)
  assert.ok(claim.body.token.length >= 40)
  assert.equal(claim.body.device.name, 'iPhone de prueba')
  phone = claim.body
  assert.equal((await call('POST', '/api/pair/claim', { code: start.body.code }, null)).status, 400, 'single use')
})

test('a phone can sync but not manage devices', async () => {
  const me = await call('GET', '/api/me', null, phone.token)
  assert.equal(me.body.role, 'device')
  const pushRes = await call('POST', '/api/sync', { changes: [{ collection: 'tasks', id: 'p1', data: { title: 'Del celular' }, updatedAt: Date.now() }] }, phone.token)
  assert.equal(pushRes.body.results[0].status, 'applied')
  assert.equal((await call('POST', '/api/pair/start', null, phone.token)).status, 403)
  assert.equal((await call('GET', '/api/devices', null, phone.token)).status, 403)
  assert.equal((await call('GET', '/api/device')).status, 403, 'the PC is not a phone')

  const info = await call('GET', '/api/device', null, phone.token)
  assert.equal(info.body.device.notify, 'always')
  const patched = await call('PATCH', '/api/device', { notify: 'away', name: 'Mi iPhone' }, phone.token)
  assert.equal(patched.body.device.notify, 'away')
  assert.equal(patched.body.device.name, 'Mi iPhone')
  assert.equal((await call('PATCH', '/api/device', { notify: 'loud' }, phone.token)).body.device.notify, 'away', 'invalid value ignored')

  const list = await call('GET', '/api/devices')
  assert.deepEqual(list.body.devices.map((d) => d.name), ['Mi iPhone'])
  assert.ok(list.body.devices[0].lastSeen > 0)
})

test('Web Push: encrypted payload and a valid VAPID signature', async () => {
  const k1 = (await call('GET', '/api/push/key', null, phone.token)).body.publicKey
  const k2 = (await call('GET', '/api/push/key')).body.publicKey
  assert.equal(k1, k2, 'one VAPID key per server')

  const endpoint = `http://127.0.0.1:${receiver.address().port}/push/abc`
  assert.equal((await call('POST', '/api/push/subscribe', { endpoint, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(uaAuth) } })).status, 403, 'owner cannot subscribe')
  const sub = await call('POST', '/api/push/subscribe', { endpoint, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(uaAuth) } }, phone.token)
  assert.equal(sub.status, 200)
  assert.equal((await call('GET', '/api/device', null, phone.token)).body.device.push, true)

  inbox.length = 0
  const sent = await call('POST', '/api/push/test', null, phone.token)
  assert.equal(sent.body.sent, 1)
  const got = inbox[0]
  assert.equal(got.payload.title, '🌱 Nomos')
  assert.equal(got.headers['content-encoding'], 'aes128gcm')
  assert.ok(Number(got.headers.ttl) > 0)

  // Authorization: vapid t=<jwt>, k=<public key>
  const m = got.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/)
  assert.ok(m, got.headers.authorization)
  const [h, c, s] = m[1].split('.')
  assert.equal(m[2], k1)
  const claims = JSON.parse(Buffer.from(c, 'base64url'))
  assert.equal(claims.aud, `http://127.0.0.1:${receiver.address().port}`)
  assert.ok(claims.exp > Date.now() / 1000)
  const raw = Buffer.from(k1, 'base64url')
  const jwk = { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
  assert.ok(ok, 'ES256 signature verifies')
})

// 2026-10-01 in America/Mazatlan (UTC-7): local HH:MM -> epoch ms
const at = (hhmm, day = '2026-10-01') => Date.parse(`${day}T${hhmm}:00-07:00`)
const remind = async (hhmm, day) => (await call('POST', `/api/_test/reminders?now=${at(hhmm, day)}`)).body

test('reminders follow the PC settings and time zone', async () => {
  await call('PATCH', '/api/device', { notify: 'always' }, phone.token)
  assert.equal((await remind('09:05')).reason, 'no-prefs', 'nothing until the PC uploads its settings')

  const now = Date.now()
  await call('POST', '/api/sync', {
    device: 'pc',
    changes: [
      { collection: 'habitSettings', id: 'main', data: { tz: 'America/Mazatlan', dayStartHour: 0, remindersEnabled: true, summaryEnabled: true, summaryTime: '20:30' }, updatedAt: now },
      { collection: 'habits', id: 'agua', data: { name: 'Agua', icon: '💧', type: 'count', target: 3, frequency: { kind: 'daily' }, createdDay: '2026-09-01', reminders: { times: ['09:00'] }, order: 0 }, updatedAt: now },
      { collection: 'habits', id: 'leer', data: { name: 'Leer', icon: '📖', type: 'check', target: 1, frequency: { kind: 'daily' }, createdDay: '2026-09-01', reminders: { times: ['10:00'] }, order: 1 }, updatedAt: now },
      { collection: 'habitLog', id: '2026-10-01|agua', data: { day: '2026-10-01', habitId: 'agua', value: 1 }, updatedAt: now }
    ]
  })

  inbox.length = 0
  assert.equal((await remind('08:59')).sent, 0, 'not yet')
  const r1 = await remind('09:05')
  assert.equal(r1.sent, 1)
  assert.equal(inbox[0].payload.title, '💧 Agua')
  assert.equal(inbox[0].payload.body, 'Llevas 1 de 3.')
  assert.equal((await remind('09:06')).sent, 0, 'each slot only once')

  // Done before its time: no reminder.
  await call('POST', '/api/sync', { changes: [{ collection: 'habitLog', id: '2026-10-01|leer', data: { day: '2026-10-01', habitId: 'leer', value: 1 }, updatedAt: Date.now() }] }, phone.token)
  assert.equal((await remind('10:01')).sent, 0)

  // Evening summary lists what's missing.
  inbox.length = 0
  assert.equal((await remind('20:31')).sent, 1)
  assert.equal(inbox[0].payload.title, '🌙 Resumen del día')
  assert.match(inbox[0].payload.body, /Te falta 1 hábito: Agua/)
})

test('"solo si la PC está apagada" and "nunca"', async () => {
  await call('PATCH', '/api/device', { notify: 'away' }, phone.token)
  // A habit due right now (real time) while the PC is online.
  const nowMs = Date.now()
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mazatlan', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(nowMs))
  const ahora = { name: 'Ahora', icon: '⏰', type: 'check', target: 1, frequency: { kind: 'daily' }, createdDay: '2026-01-01', reminders: { times: [hhmm] }, order: 2 }
  await call('POST', '/api/sync', { device: 'pc', changes: [{ collection: 'habits', id: 'ahora', data: ahora, updatedAt: nowMs }] })
  const online = (await call('POST', `/api/_test/reminders?now=${nowMs + 1000}`)).body
  assert.equal(online.desktopOnline, true)
  assert.ok(online.messages.some((m) => m.title === '⏰ Ahora'))
  assert.equal(online.sent, 0, 'PC online: the phone stays quiet')

  const later = (await call('POST', `/api/_test/reminders?now=${at('09:20', '2026-10-03')}`)).body
  assert.equal(later.desktopOnline, false)
  assert.equal(later.sent, 1, 'PC offline: the phone gets it')

  await call('PATCH', '/api/device', { notify: 'never' }, phone.token)
  assert.equal((await call('POST', `/api/_test/reminders?now=${at('09:05', '2026-10-04')}`)).body.reason, 'no-devices')
})

test('expired subscriptions are removed; unlinking revokes the token', async () => {
  await call('PATCH', '/api/device', { notify: 'always' }, phone.token)
  const gone = `http://127.0.0.1:${receiver.address().port}/push/gone`
  const other = createECDH('prime256v1')
  other.generateKeys()
  await call('POST', '/api/push/subscribe', { endpoint: gone, keys: { p256dh: b64u(other.getPublicKey()), auth: b64u(randomBytes(16)) } }, phone.token)
  const r = await call('POST', '/api/push/test', null, phone.token)
  assert.equal(r.body.sent, 1, 'only the live subscription counts')
  const again = await call('POST', '/api/push/test', null, phone.token)
  assert.equal(again.body.sent, 1)
  assert.equal(inbox.filter((x) => x.path.includes('gone')).length, 1, 'the 410 one was tried once and dropped')

  const id = (await call('GET', '/api/device', null, phone.token)).body.device.id
  assert.equal((await call('DELETE', `/api/devices/${id}`)).status, 200)
  assert.equal((await call('GET', '/api/me', null, phone.token)).status, 401)
  assert.deepEqual((await call('GET', '/api/devices')).body.devices, [])
})
