// Synced documents: (collection, id) -> JSON, last writer wins per document,
// a global seq to pull changes. See README.md ("Cómo funciona").
import { HttpError } from './http.js'

export const MAX_CHANGES = 200
const MAX_DATA_BYTES = 16 * 1024
const MAX_PULL = 500
const MAX_CLOCK_AHEAD_MS = 60 * 1000
const COLLECTION_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/

export const rowToDoc = (r) => ({
  collection: r.collection,
  id: r.id,
  data: r.deleted ? null : JSON.parse(r.data),
  deleted: !!r.deleted,
  updatedAt: r.updated_at,
  seq: r.seq
})

export const currentSeq = async (db) => (await db.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first('value')) ?? 0

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

export async function push(db, body) {
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

export async function pull(db, url) {
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

