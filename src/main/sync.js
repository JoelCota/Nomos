// Sync engine: keeps module data in step with the Nomos API (server/).
//
// Each module service that wants to sync exposes
//   sync: { collections: [...], exportDocs(): { collection: { id: data } }, importDocs(changes) }
// The engine remembers a hash of what was last synced for every document, so a
// cycle is: push what changed locally -> pull what changed elsewhere (seq > lastSeq).
// The first time it connects, the server wins for documents that exist on both
// sides, and local-only documents are uploaded.
import { randomUUID } from 'crypto'
import { hashOf, groupByCollection } from '../shared/syncDocs.js'

const POLL_MS = 30 * 1000
const DEBOUNCE_MS = 1500
const BACKOFF_MS = [30e3, 60e3, 120e3, 300e3]
const PUSH_CHUNK = 200
const DELETED = '∅'
const key = (collection, id) => `${collection}\u0000${id}`

export function normalizeServerUrl(input) {
  let s = String(input ?? '').trim()
  if (!s) throw new Error('Escribe la dirección de tu servidor.')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  let u
  try {
    u = new URL(s)
  } catch {
    throw new Error('La dirección no es válida.')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !local) throw new Error('La dirección debe empezar con https://')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

export function createSyncEngine({ loadState, saveState, getSyncables, encryptToken, decryptToken, broadcast, log, fetchImpl = fetch }) {
  // Persisted: { url, token (encrypted), device, lastSeq, known, initialized, collections, lastSyncAt }
  let state = loadState() ?? {}
  if (!state.device) {
    state.device = randomUUID()
    saveState(state)
  }
  let status = { state: state.url ? 'idle' : 'off', error: null }
  let running = false
  let again = false
  let importing = false
  let pollTimer = null
  let debounceTimer = null
  let failures = 0
  let stopped = true

  const enabled = () => !!(state.url && state.token)
  const token = () => (state.token ? decryptToken(state.token) : '')

  const publicStatus = () => ({
    connected: enabled(),
    url: state.url ?? null,
    device: state.device,
    lastSyncAt: state.lastSyncAt ?? null,
    lastSeq: state.lastSeq ?? 0,
    state: enabled() ? status.state : 'off',
    error: status.error
  })
  const setStatus = (patch) => {
    status = { ...status, ...patch }
    broadcast(publicStatus())
  }
  const persist = () => saveState(state)

  async function request(method, path, body, overrides = {}) {
    const url = overrides.url ?? state.url
    const res = await fetchImpl(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${overrides.token ?? token()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    }).catch((err) => {
      const e = new Error('No se pudo conectar con el servidor.')
      e.offline = true
      e.cause = err
      throw e
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const e = new Error(res.status === 401 ? 'Token incorrecto.' : data?.error || `El servidor respondió ${res.status}.`)
      e.status = res.status
      throw e
    }
    if (!data || data.ok === false) throw new Error('Respuesta inesperada del servidor. ¿Es la dirección de Nomos?')
    return data
  }

  // Active syncables: [{ collections, exportDocs, importDocs }]
  const syncables = () => getSyncables().filter((s) => s && Array.isArray(s.collections))
  const collectionOwner = () => {
    const map = new Map()
    for (const s of syncables()) for (const c of s.collections) map.set(c, s)
    return map
  }

  function exportAll() {
    const out = {}
    for (const s of syncables()) {
      const docs = s.exportDocs() ?? {}
      for (const c of s.collections) out[c] = docs[c] ?? {}
    }
    return out
  }

  // Applies remote documents through their module and records them as synced.
  function importRemote(docs) {
    if (!docs.length) return 0
    const owners = collectionOwner()
    const groups = groupByCollection(docs.filter((d) => owners.has(d.collection)))
    const byOwner = new Map()
    for (const [c, list] of Object.entries(groups)) {
      const owner = owners.get(c)
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), ...list])
    }
    importing = true
    try {
      for (const [owner, list] of byOwner) {
        try {
          owner.importDocs(list.map((d) => ({ collection: d.collection, id: d.id, data: d.deleted ? null : d.data })))
        } catch (err) {
          log(`[sync] import failed: ${String(err)}`)
        }
      }
    } finally {
      importing = false
    }
    // Remember what we now have locally (after the module normalized it).
    const now = exportAll()
    for (const d of docs) {
      if (!owners.has(d.collection)) continue
      const local = now[d.collection]?.[d.id]
      state.known[key(d.collection, d.id)] = { h: local === undefined ? DELETED : hashOf(local), u: d.updatedAt }
    }
    return byOwner.size
  }

  async function pull(since, { remoteWins = false } = {}) {
    let seq = since
    let imported = 0
    for (;;) {
      const page = await request('GET', `/api/sync?since=${seq}`)
      const fresh = page.docs.filter((d) => {
        const k = state.known[key(d.collection, d.id)]
        return remoteWins || !k || d.updatedAt > k.u
      })
      imported += fresh.length
      importRemote(fresh)
      seq = page.seq
      state.lastSeq = Math.max(state.lastSeq ?? 0, seq)
      persist()
      if (!page.more) break
    }
    return imported
  }

  async function pushLocal() {
    const now = Date.now()
    const docs = exportAll()
    const active = new Set(Object.keys(docs))
    const changes = []
    for (const [collection, items] of Object.entries(docs)) {
      for (const [id, data] of Object.entries(items)) {
        if (state.known[key(collection, id)]?.h !== hashOf(data)) changes.push({ collection, id, data, updatedAt: now })
      }
    }
    for (const [k, v] of Object.entries(state.known)) {
      const [collection, id] = k.split('\u0000')
      if (!active.has(collection) || v.h === DELETED) continue
      if (!(id in docs[collection])) changes.push({ collection, id, data: null, deleted: true, updatedAt: now })
    }
    let pushed = 0
    for (let i = 0; i < changes.length; i += PUSH_CHUNK) {
      const chunk = changes.slice(i, i + PUSH_CHUNK)
      const res = await request('POST', '/api/sync', { device: state.device, changes: chunk })
      const stale = []
      res.results.forEach((r, j) => {
        const ch = chunk[j]
        if (r.status === 'applied') {
          state.known[key(ch.collection, ch.id)] = { h: ch.data === null ? DELETED : hashOf(ch.data), u: r.doc?.updatedAt ?? ch.updatedAt }
          pushed++
        } else if (r.doc) stale.push(r.doc)
      })
      // Someone else changed it more recently: take their version.
      importRemote(stale)
      persist()
    }
    return pushed
  }

  async function cycle() {
    if (!enabled() || stopped) return
    if (running) {
      again = true
      return
    }
    running = true
    clearTimeout(pollTimer)
    setStatus({ state: 'syncing' })
    try {
      state.known ??= {}
      const active = syncables().flatMap((s) => s.collections)
      const newCollections = active.some((c) => !(state.collections ?? []).includes(c))
      if (!state.initialized) {
        await pull(0, { remoteWins: true })
        state.initialized = true
      } else if (newCollections) {
        // A module was turned on: catch up on everything it missed.
        await pull(0)
      }
      // Remember which collections were active, so turning a module back on catches up.
      state.collections = active
      await pushLocal()
      await pull(state.lastSeq ?? 0)
      state.lastSyncAt = new Date().toISOString()
      persist()
      failures = 0
      setStatus({ state: 'ok', error: null })
    } catch (err) {
      failures++
      log(`[sync] ${err.message}${err.cause ? ` (${String(err.cause)})` : ''}`)
      setStatus({ state: err.offline ? 'offline' : 'error', error: err.message })
    } finally {
      running = false
      schedule()
      if (again) {
        again = false
        queueMicrotask(() => cycle())
      }
    }
  }

  function schedule() {
    clearTimeout(pollTimer)
    if (!enabled() || stopped) return
    const wait = failures ? BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)] : POLL_MS
    pollTimer = setTimeout(() => cycle(), wait)
    pollTimer.unref?.()
  }

  return {
    start() {
      stopped = false
      if (enabled()) {
        setStatus({ state: 'idle' })
        setTimeout(() => cycle(), 1000).unref?.()
      }
    },
    stop() {
      stopped = true
      clearTimeout(pollTimer)
      clearTimeout(debounceTimer)
    },
    // A module saved data: push it soon.
    localChanged() {
      if (importing || !enabled() || stopped) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => cycle(), DEBOUNCE_MS)
      debounceTimer.unref?.()
    },
    syncNow: () => cycle(),
    status: publicStatus,
    async connect(rawUrl, rawToken) {
      const url = normalizeServerUrl(rawUrl)
      const tok = String(rawToken ?? '').trim()
      if (!tok) throw new Error('Escribe el token de tu servidor.')
      const me = await request('GET', '/api/me', null, { url, token: tok })
      if (me.app !== 'nomos') throw new Error('Ese servidor no es una API de Nomos.')
      const sameServer = state.url === url
      state = {
        device: state.device,
        url,
        token: encryptToken(tok),
        lastSeq: sameServer ? state.lastSeq ?? 0 : 0,
        known: sameServer ? state.known ?? {} : {},
        initialized: sameServer ? !!state.initialized : false,
        collections: sameServer ? state.collections ?? [] : []
      }
      persist()
      failures = 0
      setStatus({ state: 'idle', error: null })
      await cycle()
      return publicStatus()
    },
    disconnect() {
      clearTimeout(pollTimer)
      clearTimeout(debounceTimer)
      state = { device: state.device }
      persist()
      setStatus({ state: 'off', error: null })
      return publicStatus()
    },
    // For the self-test.
    debug: { state: () => state, cycle, pushLocal, pull }
  }
}
