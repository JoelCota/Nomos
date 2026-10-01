// Two kinds of callers:
//   owner  — the master token (NOMOS_TOKEN), used by Nomos on the PC;
//   device — a phone linked with a pairing code; it has its own token, stored
//            here only as a SHA-256 hash, and can be unlinked from the PC.
import { HttpError, sha256Hex } from './http.js'

function sameString(a, b) {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.byteLength !== y.byteLength) {
    crypto.subtle.timingSafeEqual(y, y)
    return false
  }
  return crypto.subtle.timingSafeEqual(x, y)
}

export async function authenticate(request, env) {
  if (!env.NOMOS_TOKEN) throw new HttpError(500, 'El servidor no tiene token configurado (NOMOS_TOKEN).')
  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  if (sameString(token, env.NOMOS_TOKEN)) return { role: 'owner' }
  if (!env.DB) return null
  const device = await env.DB.prepare('SELECT * FROM devices WHERE token_hash = ?1').bind(await sha256Hex(token)).first()
  return device ? { role: 'device', device } : null
}

// Remember when the PC and each phone were last seen (at most once a minute).
export async function touch(env, who, now = Date.now()) {
  if (who.role === 'owner') {
    await env.DB.prepare(
      `INSERT INTO kv (key, value) VALUES ('desktopSeen', ?1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE CAST(kv.value AS INTEGER) < ?2`
    )
      .bind(String(now), now - 60000)
      .run()
  } else if (!who.device.last_seen || who.device.last_seen < now - 60000) {
    await env.DB.prepare('UPDATE devices SET last_seen = ?1 WHERE id = ?2').bind(now, who.device.id).run()
  }
}
