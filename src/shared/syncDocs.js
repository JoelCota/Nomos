// Helpers to turn module data into sync documents and back.
// A document is { collection, id, data } where data === null means deleted.
// Everything here is pure, so it's shared and unit-tested.

// JSON with sorted keys, so equal data always gives the same string.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

// Small, fast string hash (FNV-1a, 2 x 32 bits) to remember what was synced.
export function hashOf(value) {
  const s = stableStringify(value)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  return `${h1.toString(36)}${h2.toString(36)}:${s.length}`
}

// An ordered list of { id, ... } -> { id: item } (with its position as `order`).
export function listToDocs(list, { order = false } = {}) {
  const out = {}
  list.forEach((item, i) => {
    if (item && typeof item.id === 'string') out[item.id] = order ? { ...item, order: i } : { ...item }
  })
  return out
}

// Applies document changes to a list. `order` sorts by the synced position;
// otherwise `sortBy(item)` (if given) decides. `normalize(data, id)` may clean an
// item or throw to skip it.
export function applyListDocs(list, changes, { order = false, sortBy = null, normalize = null, onSkip = null } = {}) {
  const byId = new Map(list.map((item, i) => [item.id, order ? { ...item, order: i } : item]))
  for (const ch of changes) {
    if (ch.data === null || ch.data === undefined) {
      byId.delete(ch.id)
      continue
    }
    try {
      const item = { ...(normalize ? normalize(ch.data, ch.id) : ch.data), id: ch.id }
      if (order) item.order = Number.isFinite(ch.data.order) ? ch.data.order : Number.MAX_SAFE_INTEGER
      byId.set(ch.id, item)
    } catch (err) {
      onSkip?.(ch, err)
    }
  }
  const items = [...byId.values()]
  if (order) {
    items.sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
    return items.map(({ order: _o, ...rest }) => rest)
  }
  if (sortBy) items.sort((a, b) => (sortBy(a) < sortBy(b) ? -1 : sortBy(a) > sortBy(b) ? 1 : 0))
  return items
}

// Habit log { 'YYYY-MM-DD': { habitId: value } } <-> one document per cell.
const cellId = (day, habitId) => `${day}|${habitId}`

export function logToDocs(log) {
  const out = {}
  for (const [day, cells] of Object.entries(log ?? {})) {
    for (const [habitId, value] of Object.entries(cells ?? {})) {
      if (value > 0) out[cellId(day, habitId)] = { day, habitId, value }
    }
  }
  return out
}

export function applyLogDocs(log, changes) {
  const next = Object.fromEntries(Object.entries(log ?? {}).map(([d, cells]) => [d, { ...cells }]))
  for (const ch of changes) {
    const [day, habitId] = ch.id.split('|')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '') || !habitId) continue
    const value = Math.max(0, Math.round(Number(ch.data?.value) || 0))
    if (value > 0) {
      next[day] = { ...(next[day] ?? {}), [habitId]: Math.min(value, 100000) }
    } else if (next[day]) {
      delete next[day][habitId]
      if (!Object.keys(next[day]).length) delete next[day]
    }
  }
  return next
}

export const groupByCollection = (changes) => {
  const out = {}
  for (const ch of changes) (out[ch.collection] ??= []).push(ch)
  return out
}
