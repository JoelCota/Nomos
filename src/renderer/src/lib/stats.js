import { LOCALE, dayKey } from '../../../shared/time'

export const lastNDays = (n) => {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push({ key: dayKey(d), label: d.toLocaleDateString(LOCALE, { weekday: 'short' }) })
  }
  return out
}

export const countByDay = (history, days) => {
  const counts = {}
  for (const e of history) {
    if (e.mode !== 'work') continue
    const k = dayKey(new Date(e.completedAt))
    counts[k] = (counts[k] ?? 0) + 1
  }
  return days.map((d) => ({ ...d, count: counts[d.key] ?? 0 }))
}

export const currentStreak = (history) => {
  const days = new Set()
  for (const e of history) {
    if (e.mode === 'work') days.add(dayKey(new Date(e.completedAt)))
  }
  let streak = 0
  const d = new Date()
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  while (days.has(dayKey(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}
