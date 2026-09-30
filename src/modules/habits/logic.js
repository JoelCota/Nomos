// Pure habit logic, shared by the main process and the renderer.
//
// habit = {
//   id, name, icon,
//   type: 'check' | 'count' | 'duration',
//   target,                        // count: times per day · duration: minutes per day · check: 1
//   frequency: { kind: 'daily' } | { kind: 'days', days: [0..6] (0 = Sunday) } | { kind: 'weekly', times: 1..7 },
//   createdDay: 'YYYY-MM-DD'
// }
// log = { 'YYYY-MM-DD': { [habitId]: number } }   (check: 1 · count: times · duration: minutes)
//
// Days are 'YYYY-MM-DD' keys, which compare correctly as strings.
import { dayKey } from '../../shared/time.js'

export const TYPE_LABELS = { check: 'Sí / no', count: 'Contador', duration: 'Duración' }
export const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] // index = getDay()
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday first

// "Today" taking the day-start hour into account (e.g. at 01:30 with a 4:00 start it is still yesterday).
export const todayKey = (dayStartHour = 0, now = new Date()) => dayKey(new Date(now.getTime() - dayStartHour * 3600e3))

export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}
export const addDays = (k, n) => {
  const d = parseKey(k)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}
export const weekdayOf = (k) => parseKey(k).getDay()
export const mondayOf = (k) => addDays(k, -((weekdayOf(k) + 6) % 7))

export const targetOf = (h) => (h.type === 'check' ? 1 : Math.max(1, Math.round(h.target ?? 1)))
export const valueOf = (log, k, id) => log?.[k]?.[id] ?? 0
export const isDoneOn = (h, log, k) => valueOf(log, k, h.id) >= targetOf(h)

// Days the habit *must* be done. Weekly habits have no required days.
export const isRequiredOn = (h, k) => {
  if (k < h.createdDay) return false
  const f = h.frequency
  if (f.kind === 'daily') return true
  if (f.kind === 'days') return f.days.includes(weekdayOf(k))
  return false
}

// Days the habit shows up in "today's" list: required days, or any day for weekly habits.
export const isActiveOn = (h, k) => k >= h.createdDay && (h.frequency.kind === 'weekly' || isRequiredOn(h, k))

// Completed days in the week that starts on `monday`, not counting days after `upTo`.
export function weekCount(h, log, monday, upTo) {
  let n = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    if (d > upTo) break
    if (isDoneOn(h, log, d)) n++
  }
  return n
}

// Current streak. Day-based habits: consecutive required days done (non-required days
// don't break it; today not done yet doesn't break it either). Weekly habits: consecutive
// weeks that met the goal (the current week doesn't break it until it's over).
export function streak(h, log, today) {
  if (h.frequency.kind === 'weekly') {
    const times = h.frequency.times
    const firstMonday = mondayOf(h.createdDay)
    let monday = mondayOf(today)
    let n = weekCount(h, log, monday, today) >= times ? 1 : 0
    monday = addDays(monday, -7)
    while (monday >= firstMonday) {
      if (weekCount(h, log, monday, today) >= times) n++
      else break
      monday = addDays(monday, -7)
    }
    return { count: n, unit: 'week' }
  }
  let d = today
  let n = 0
  if (isRequiredOn(h, d) && !isDoneOn(h, log, d)) d = addDays(d, -1)
  for (let guard = 0; d >= h.createdDay && guard < 20000; guard++) {
    if (isRequiredOn(h, d)) {
      if (isDoneOn(h, log, d)) n++
      else break
    }
    d = addDays(d, -1)
  }
  return { count: n, unit: 'day' }
}

export function bestStreak(h, log, today) {
  let best = 0
  let cur = 0
  if (h.frequency.kind === 'weekly') {
    const times = h.frequency.times
    const current = mondayOf(today)
    for (let m = mondayOf(h.createdDay); m <= current; m = addDays(m, 7)) {
      if (weekCount(h, log, m, today) >= times) best = Math.max(best, ++cur)
      else if (m !== current) cur = 0
    }
    return { count: best, unit: 'week' }
  }
  for (let d = h.createdDay, guard = 0; d <= today && guard < 20000; d = addDays(d, 1), guard++) {
    if (!isRequiredOn(h, d)) continue
    if (isDoneOn(h, log, d)) best = Math.max(best, ++cur)
    else if (d !== today) cur = 0
  }
  return { count: best, unit: 'day' }
}

// Share of required days done in the last `days` days (today excluded). null if none.
export function completionRate(h, log, today, days = 30) {
  if (h.frequency.kind === 'weekly') {
    let met = 0
    let weeks = 0
    for (let m = addDays(mondayOf(today), -7), i = 0; i < Math.ceil(days / 7) && m >= mondayOf(h.createdDay); i++, m = addDays(m, -7)) {
      weeks++
      if (weekCount(h, log, m, today) >= h.frequency.times) met++
    }
    return weeks ? met / weeks : null
  }
  let required = 0
  let done = 0
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, -i)
    if (!isRequiredOn(h, d)) continue
    required++
    if (isDoneOn(h, log, d)) done++
  }
  return required ? done / required : null
}

// "Perfect days" in a row: days where every habit required that day was done.
// Days with nothing required are skipped; today not finished yet doesn't break it.
export function perfectStreak(habits, log, today) {
  const dayBased = habits.filter((h) => h.frequency.kind !== 'weekly')
  if (!dayBased.length) return 0
  const earliest = dayBased.reduce((a, h) => (h.createdDay < a ? h.createdDay : a), today)
  const perfect = (d) => {
    const req = dayBased.filter((h) => isRequiredOn(h, d))
    if (!req.length) return null
    return req.every((h) => isDoneOn(h, log, d))
  }
  let d = today
  let n = 0
  if (perfect(d) === false) d = addDays(d, -1)
  for (let guard = 0; d >= earliest && guard < 20000; guard++) {
    const p = perfect(d)
    if (p === false) break
    if (p) n++
    d = addDays(d, -1)
  }
  return n
}

// Habits for a given day, with their progress. `settled` = counts as done for the
// day's progress ring (done that day, or a weekly habit whose weekly goal is already met).
export function dayItems(habits, log, day) {
  return habits
    .filter((h) => isActiveOn(h, day))
    .map((h) => {
      const value = valueOf(log, day, h.id)
      const target = targetOf(h)
      const done = value >= target
      const week = h.frequency.kind === 'weekly' ? { count: weekCount(h, log, mondayOf(day), day), times: h.frequency.times } : null
      return { habit: h, value, target, done, week, settled: done || (week ? week.count >= week.times : false) }
    })
}

export function dayProgress(habits, log, day) {
  const items = dayItems(habits, log, day)
  return { done: items.filter((i) => i.settled).length, total: items.length, items }
}

// Last `n` days (oldest first) for the mini grid.
export function recentDays(h, log, today, n = 7) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i)
    out.push({ day: d, done: isDoneOn(h, log, d), required: isRequiredOn(h, d), active: d >= h.createdDay })
  }
  return out
}

export function progressText(item) {
  const { habit: h, value, target, week } = item
  if (h.type === 'count') return `${value}/${target}`
  if (h.type === 'duration') return `${value}/${target} min`
  if (week) return `${week.count}/${week.times} sem.`
  return ''
}

export function frequencyText(h) {
  const f = h.frequency
  if (f.kind === 'daily') return 'Todos los días'
  if (f.kind === 'weekly') return `${f.times} ${f.times === 1 ? 'vez' : 'veces'} por semana`
  const days = WEEK_ORDER.filter((d) => f.days.includes(d))
  if (days.length === 5 && !f.days.includes(0) && !f.days.includes(6)) return 'Entre semana'
  if (days.length === 2 && f.days.includes(0) && f.days.includes(6)) return 'Fines de semana'
  return days.map((d) => WEEKDAY_LETTERS[d]).join(' ')
}

export function goalText(h) {
  if (h.type === 'count') return `${targetOf(h)} veces al día`
  if (h.type === 'duration') return `${targetOf(h)} min al día`
  return null
}

export const streakText = (s) =>
  s.unit === 'week' ? `${s.count} ${s.count === 1 ? 'semana' : 'semanas'}` : `${s.count} ${s.count === 1 ? 'día' : 'días'}`

// ---- reminders: time helpers and validation ----

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
export const isTime = (t) => typeof t === 'string' && TIME.test(t)
export const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const hasReminders = (h) => !!(h.reminders && (h.reminders.times?.length || h.reminders.interval))

// Clean reminders coming from the UI. Returns null when there are none.
export function normalizeReminders(r) {
  if (!r || typeof r !== 'object') return null
  const times = [...new Set((Array.isArray(r.times) ? r.times : []).filter(isTime))].sort().slice(0, 6)
  let interval = null
  const i = r.interval
  if (i && isTime(i.from) && isTime(i.to)) {
    const every = Math.min(480, Math.max(15, Math.round(Number(i.every) || 60)))
    if (toMinutes(i.from) >= toMinutes(i.to)) throw new Error('En «Repetir», la hora de inicio debe ser anterior a la de fin.')
    interval = { every, from: i.from, to: i.to }
  }
  return times.length || interval ? { times, interval } : null
}

// ---- validation (main process) ----

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// Returns a clean habit, or throws with a user-facing message.
export function normalizeHabit(input, base = {}) {
  const src = { ...base, ...input }
  const name = String(src.name ?? '').trim().slice(0, 60)
  if (!name) throw new Error('El hábito necesita un nombre.')
  const type = ['check', 'count', 'duration'].includes(src.type) ? src.type : 'check'
  const target = type === 'check' ? 1 : type === 'count' ? clampInt(src.target, 1, 100, 1) : clampInt(src.target, 1, 600, 10)
  const f = src.frequency ?? {}
  let frequency
  if (f.kind === 'weekly') frequency = { kind: 'weekly', times: clampInt(f.times, 1, 7, 3) }
  else if (f.kind === 'days') {
    const days = [...new Set((Array.isArray(f.days) ? f.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    if (!days.length) throw new Error('Elige al menos un día de la semana.')
    frequency = { kind: 'days', days }
  } else frequency = { kind: 'daily' }
  const icon = String(src.icon ?? '').trim().slice(0, 8) || '✅'
  const reminders = normalizeReminders(src.reminders)
  return { id: src.id, name, icon, type, target, frequency, createdDay: src.createdDay, reminders }
}

export function remindersText(h) {
  const r = h.reminders
  if (!r) return null
  const parts = [...(r.times ?? [])]
  if (r.interval) parts.push(`cada ${r.interval.every} min de ${r.interval.from} a ${r.interval.to}`)
  return parts.length ? `⏰ ${parts.join(', ')}` : null
}
