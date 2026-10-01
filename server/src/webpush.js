// Web Push with nothing but WebCrypto:
//   - VAPID (RFC 8292): an ES256 JWT that identifies this server;
//   - payload encryption "aes128gcm" (RFC 8291 + RFC 8188).
// The VAPID key pair is created the first time and kept in the kv table.
import { b64url, fromB64url, kvGet, kvSet } from './http.js'

const enc = new TextEncoder()
const concat = (...parts) => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)))
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let i = 0
  for (const a of arrays) {
    out.set(a, i)
    i += a.length
  }
  return out
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// ---------------------------------------------------------------------------
// VAPID

export async function vapidKeys(db) {
  const saved = await kvGet(db, 'vapid')
  if (saved) return saved
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const keys = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey)
  }
  await kvSet(db, 'vapid', keys)
  // Another request may have raced us: keep whichever was stored first.
  return (await kvGet(db, 'vapid')) ?? keys
}

async function vapidHeader(endpoint, keys, subject, now = Date.now()) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }))
  )
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`
}

// ---------------------------------------------------------------------------
// Payload encryption (aes128gcm)

export async function encryptPayload(payload, p256dh, authSecret) {
  const uaPublic = fromB64url(p256dh)
  const auth = fromB64url(authSecret)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  // RFC 8291 section 3.4
  const prkKey = await hmac(auth, ecdhSecret)
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, [1]))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12)

  const plaintext = concat(typeof payload === 'string' ? enc.encode(payload) : payload, [2]) // last-record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  const rs = new Uint8Array([0, 0, 16, 0]) // record size 4096
  return concat(salt, rs, [asPublic.byteLength], asPublic, ciphertext)
}

// ---------------------------------------------------------------------------
// Sending

// Sends one notification. Returns 'ok', 'gone' (subscription expired: delete
// it) or 'error'.
export async function sendPush(sub, message, { keys, subject, ttl = 4 * 3600, fetchImpl = fetch } = {}) {
  try {
    const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth)
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(sub.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: 'high'
      },
      body
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    if (!res.ok) {
      console.warn(`push ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return 'error'
    }
    return 'ok'
  } catch (err) {
    console.warn(`push failed: ${String(err)}`)
    return 'error'
  }
}

// Sends to every subscription of the given devices; expired ones are removed.
export async function pushToDevices(env, deviceIds, message) {
  if (!deviceIds.length) return 0
  const { results: subs } = await env.DB.prepare(
    `SELECT * FROM push_subs WHERE device_id IN (SELECT value FROM json_each(?1))`
  )
    .bind(JSON.stringify(deviceIds))
    .all()
  if (!subs.length) return 0
  const keys = await vapidKeys(env.DB)
  const subject = (await kvGet(env.DB, 'origin')) ?? 'https://github.com/JoelCota/Nomos'
  let sent = 0
  for (const sub of subs) {
    const r = await sendPush(sub, message, { keys, subject })
    if (r === 'ok') sent++
    if (r === 'gone') await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(sub.endpoint).run()
  }
  return sent
}
