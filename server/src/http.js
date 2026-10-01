// Small HTTP helpers shared by every route.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400'
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS }
  })

export const fail = (status, error) => json({ ok: false, error }, status)

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'JSON inválido.')
  }
}

// base64url <-> bytes
export const b64url = (bytes) => {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const fromB64url = (str) => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Key/value table helpers.
export const kvGet = async (db, key) => {
  const v = await db.prepare('SELECT value FROM kv WHERE key = ?1').bind(key).first('value')
  return v == null ? null : JSON.parse(v)
}
export const kvSet = (db, key, value) =>
  db.prepare('INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
export const kvDelete = (db, key) => db.prepare('DELETE FROM kv WHERE key = ?1').bind(key).run()
