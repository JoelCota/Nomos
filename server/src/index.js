// Nomos sync API — a Cloudflare Worker backed by D1.
//
// Every synced record is a document identified by (collection, id). Clients push
// changes with their own timestamp and the newest one wins (last writer wins per
// document). Each accepted write gets a new global `seq`, so a client pulls
// everything that changed with GET /api/sync?since=<last seq it saw>.
//
// All /api routes except /api/health need `Authorization: Bearer <NOMOS_TOKEN>`.

const VERSION = 1
const MAX_CHANGES = 200
const MAX_DATA_BYTES = 16 * 1024
const MAX_PULL = 500
const MAX_CLOCK_AHEAD_MS = 60 * 1000
const COLLECTION_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400'
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } })
const fail = (status, error) => json({ ok: false, error }, status)

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Auth

async function authorized(request, env) {
  const expected = env.NOMOS_TOKEN
  if (!expected) throw new HttpError(500, 'El servidor no tiene token configurado (NOMOS_TOKEN).')
  const header = request.headers.get('Authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const enc = new TextEncoder()
  const a = enc.encode(given)
  const b = enc.encode(expected)
  // Constant-time comparison (compare against itself when lengths differ).
  if (a.byteLength !== b.byteLength) {
    crypto.subtle.timingSafeEqual(b, b)
    return false
  }
  return crypto.subtle.timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Documents

const rowToDoc = (r) => ({
  collection: r.collection,
  id: r.id,
  data: r.deleted ? null : JSON.parse(r.data),
  deleted: !!r.deleted,
  updatedAt: r.updated_at,
  seq: r.seq
})

const currentSeq = async (db) => (await db.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first('value')) ?? 0

// Validates and normalizes the pushed changes. Later duplicates of the same
// document replace earlier ones.
function cleanChanges(input, now) {
  if (!Array.isArray(input)) throw new HttpError(400, '"changes" debe ser una lista.')
  if (input.length > MAX_CHANGES) throw new HttpError(413, `Máximo ${MAX_CHANGES} cambios por petición.`)
  const byKey = new Map()
  for (const c of input) {
    if (!c || typeof c !== 'object') throw new HttpError(400, 'Cambio inválido.')
    if (typeof c.collection !== 'string' || !COLLECTION_RE.test(c.collection)) throw new HttpError(400, 'Colección inválida.')
    if (typeof c.id !== 'string' || !c.id || c.id.length > 128) throw new HttpError(400, 'Id inválido.')
    const updatedAt = Number(c.updatedAt)
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) throw new HttpError(400, 'updatedAt inválido.')
    const deleted = c.deleted === true || c.data === null || c.data === undefined
    let data = null
    if (!deleted) {
      if (typeof c.data !== 'object' || Array.isArray(c.data)) throw new HttpError(400, '"data" debe ser un objeto.')
      data = JSON.stringify(c.data)
      if (new TextEncoder().encode(data).byteLength > MAX_DATA_BYTES) throw new HttpError(413, 'Documento demasiado grande.')
    }
    // A client clock far in the future would win every conflict: cap it.
    const u = Math.round(Math.min(updatedAt, now + MAX_CLOCK_AHEAD_MS))
    byKey.set(`${c.collection}\u0000${c.id}`, { c: c.collection, i: c.id, d: data, x: deleted ? 1 : 0, u })
  }
  return [...byKey.values()]
}

async function push(db, body) {
  const device = typeof body?.device === 'string' ? body.device.slice(0, 64) : ''
  const changes = cleanChanges(body?.changes, Date.now())
  if (!changes.length) return { ok: true, seq: await currentSeq(db), results: [] }
  const payload = JSON.stringify(changes)

  // One atomic batch: insert/update every document whose timestamp is newer
  // (ties broken by device id), numbering them after the current seq, then move
  // the counter forward.
  await db.batch([
    db
      .prepare(
        `INSERT INTO docs (collection, id, data, deleted, updated_at, device, seq)
         SELECT json_extract(j.value, '$.c'), json_extract(j.value, '$.i'), json_extract(j.value, '$.d'),
                json_extract(j.value, '$.x'), json_extract(j.value, '$.u'), ?2,
                (SELECT value FROM meta WHERE key = 'seq') + j.key + 1
         FROM json_each(?1) AS j WHERE true
         ON CONFLICT (collection, id) DO UPDATE SET
           data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
           device = excluded.device, seq = excluded.seq
         WHERE excluded.updated_at > docs.updated_at
            OR (excluded.updated_at = docs.updated_at AND excluded.device > docs.device)`
      )
      .bind(payload, device),
    db.prepare(`UPDATE meta SET value = value + ?1 WHERE key = 'seq'`).bind(changes.length)
  ])

  const { results: rows } = await db
    .prepare(
      `SELECT collection, id, data, deleted, updated_at, device, seq FROM docs
       WHERE (collection, id) IN (SELECT json_extract(value, '$.c'), json_extract(value, '$.i') FROM json_each(?1))`
    )
    .bind(payload)
    .all()
  const byKey = new Map(rows.map((r) => [`${r.collection}\u0000${r.id}`, r]))
  const results = changes.map((ch) => {
    const r = byKey.get(`${ch.c}\u0000${ch.i}`)
    const applied = !!r && r.updated_at === ch.u && r.device === device && r.deleted === ch.x
    return { collection: ch.c, id: ch.i, status: applied ? 'applied' : 'stale', doc: r ? rowToDoc(r) : null }
  })
  return { ok: true, seq: await currentSeq(db), results }
}

async function pull(db, url) {
  const since = Math.max(0, Math.floor(Number(url.searchParams.get('since') ?? 0)) || 0)
  const limit = Math.min(MAX_PULL, Math.max(1, Math.floor(Number(url.searchParams.get('limit') ?? MAX_PULL)) || MAX_PULL))
  const { results: rows } = await db
    .prepare(`SELECT collection, id, data, deleted, updated_at, seq FROM docs WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
    .bind(since, limit)
    .all()
  return {
    ok: true,
    docs: rows.map(rowToDoc),
    seq: rows.length ? rows[rows.length - 1].seq : since,
    more: rows.length === limit
  }
}

// ---------------------------------------------------------------------------
// Router

async function route(request, env) {
  const url = new URL(request.url)
  const { pathname } = url
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (pathname === '/api/health' && request.method === 'GET') return json({ ok: true, app: 'nomos', version: VERSION })
  if (!pathname.startsWith('/api/')) return fail(404, 'No encontrado.')

  if (!(await authorized(request, env))) return fail(401, 'Token incorrecto.')
  if (!env.DB) throw new HttpError(500, 'El servidor no tiene base de datos (binding DB).')

  if (pathname === '/api/me' && request.method === 'GET') return json({ ok: true, app: 'nomos', version: VERSION, seq: await currentSeq(env.DB) })
  if (pathname === '/api/sync' && request.method === 'GET') return json(await pull(env.DB, url))
  if (pathname === '/api/sync' && request.method === 'POST') {
    let body
    try {
      body = await request.json()
    } catch {
      throw new HttpError(400, 'JSON inválido.')
    }
    return json(await push(env.DB, body))
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
  }
}
