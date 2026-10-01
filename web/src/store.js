// The phone's copy of the data, kept in step with the Nomos server.
//
// Same documents as the PC (see server/README.md). Changes made here are applied
// at once (optimistic), queued in an outbox and sent; pulls bring everything that
// changed since the last seq. A document with a pending local change is not
// overwritten by a pull until that change has been sent.
import { useSyncExternalStore } from 'react'

const LS = { token: 'nomos.token', device: 'nomos.device', cache: 'nomos.cache', outbox: 'nomos.outbox' }
const POLL_MS = 15000
const key = (c, id) => `${c}\u0000${id}`

const load = (k, fallback) => {
  try {
    const v = localStorage.getItem(k)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
const save = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

let state = {
  token: load(LS.token, null),
  device: load(LS.device, null),
  docs: load(LS.cache, { seq: 0, docs: {} }).docs, // key -> { collection, id, data, updatedAt }
  seq: load(LS.cache, { seq: 0 }).seq,
  outbox: load(LS.outbox, []),
  online: true,
  syncing: false,
  lastSync: null,
  error: null,
  revoked: false
}
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const set = (patch) => {
  state = { ...state, ...patch }
  emit()
}
const persist = () => {
  save(LS.cache, { seq: state.seq, docs: state.docs })
  save(LS.outbox, state.outbox)
}

export const getState = () => state
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
// The whole state (a new object only when something changed); derive lists with useMemo.
export const useStore = () => useSyncExternalStore(subscribe, getState)

// ---------------------------------------------------------------------------
// API

async function api(method, path, body, { auth = true } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(auth && state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })
  } catch {
    set({ online: false })
    const e = new Error('Sin conexión.')
    e.offline = true
    throw e
  }
  if (!state.online) set({ online: true })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* not JSON */
  }
  if (res.status === 401 && auth) {
    forget(true)
    throw new Error('Este celular ya no está vinculado.')
  }
  if (!res.ok || !data || data.ok === false) throw new Error(data?.error || `Error ${res.status}`)
  return data
}
export { api }

// ---------------------------------------------------------------------------
// Linking

export async function pair(code, name) {
  const r = await api('POST', '/api/pair/claim', { code, name }, { auth: false })
  save(LS.token, r.token)
  save(LS.device, r.device)
  set({ token: r.token, device: r.device, revoked: false, docs: {}, seq: 0, outbox: [] })
  persist()
  await syncNow()
  return r.device
}

export function forget(revoked = false) {
  for (const k of Object.values(LS)) save(k, null)
  set({ token: null, device: null, docs: {}, seq: 0, outbox: [], revoked })
}

export async function unlink() {
  try {
    await api('DELETE', '/api/device')
  } finally {
    forget(false)
  }
}

// ---------------------------------------------------------------------------
// Sync

let running = null
export function syncNow() {
  if (!state.token) return Promise.resolve()
  if (running) return running
  running = (async () => {
    set({ syncing: true })
    try {
      await flush()
      await pull()
      set({ lastSync: Date.now(), error: null })
    } catch (err) {
      if (!err.offline) set({ error: err.message })
    } finally {
      running = null
      set({ syncing: false })
    }
  })()
  return running
}

async function flush() {
  while (state.outbox.length) {
    const batch = state.outbox.slice(0, 200)
    const r = await api('POST', '/api/sync', { changes: batch })
    const docs = { ...state.docs }
    r.results.forEach((res) => {
      // Someone changed it more recently: show their version.
      if (res.status === 'stale' && res.doc) docs[key(res.doc.collection, res.doc.id)] = res.doc.deleted ? undefined : res.doc
    })
    for (const k of Object.keys(docs)) if (docs[k] === undefined) delete docs[k]
    set({ docs, outbox: state.outbox.slice(batch.length) })
    persist()
  }
}

async function pull() {
  for (;;) {
    const page = await api('GET', `/api/sync?since=${state.seq}`)
    const pending = new Set(state.outbox.map((c) => key(c.collection, c.id)))
    const docs = { ...state.docs }
    for (const d of page.docs) {
      const k = key(d.collection, d.id)
      if (pending.has(k)) continue
      if (d.deleted) delete docs[k]
      else docs[k] = { collection: d.collection, id: d.id, data: d.data, updatedAt: d.updatedAt }
    }
    set({ docs, seq: page.seq })
    persist()
    if (!page.more) break
  }
}

// Local change: apply now, send soon.
let flushTimer = null
export function write(collection, id, data) {
  const updatedAt = Date.now()
  const k = key(collection, id)
  const docs = { ...state.docs }
  if (data === null) delete docs[k]
  else docs[k] = { collection, id, data, updatedAt }
  const outbox = [...state.outbox.filter((c) => key(c.collection, c.id) !== k), { collection, id, data, deleted: data === null, updatedAt }]
  set({ docs, outbox })
  persist()
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => syncNow(), 400)
}

// Poll while the app is open and visible.
let poll = null
export function startSync() {
  const tick = () => {
    if (document.visibilityState === 'visible') syncNow()
  }
  document.addEventListener('visibilitychange', tick)
  window.addEventListener('online', tick)
  clearInterval(poll)
  poll = setInterval(tick, POLL_MS)
  tick()
}

// ---------------------------------------------------------------------------
// Views over the documents

const collection = (docs, name) => Object.values(docs).filter((d) => d.collection === name)
const byOrder = (a, b) => (a.data.order ?? 1e9) - (b.data.order ?? 1e9) || a.id.localeCompare(b.id)

export function selectHabits(docs) {
  return collection(docs, 'habits')
    .sort(byOrder)
    .map((d) => {
      const { order: _o, ...h } = d.data
      return { ...h, id: d.id }
    })
}

export function selectLog(docs) {
  const log = {}
  for (const d of collection(docs, 'habitLog')) {
    if (d.data?.value > 0) (log[d.data.day] ??= {})[d.data.habitId] = d.data.value
  }
  return log
}

export const selectTasks = (docs) => collection(docs, 'tasks').sort(byOrder).map((d) => ({ ...d.data, id: d.id }))

export const selectHabitSettings = (docs) => docs[key('habitSettings', 'main')]?.data ?? { dayStartHour: 0 }
