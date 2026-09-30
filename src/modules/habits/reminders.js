// Pure reminder scheduling for habits (no timers, no Electron) so it can be tested.
//
// habit.reminders = {
//   times: ['09:00', '21:00'],                          // fixed times (0..6)
//   interval: null | { every: 90, from: '09:00', to: '18:00' }  // repeat inside a window
// }
import { dayKey } from '../../shared/time.js'
import { dayItems, fromMinutes, hasReminders, isTime, toMinutes } from './logic.js'

export { fromMinutes, hasReminders, isTime, toMinutes }

export const GRACE_MIN = 30 // a missed reminder still fires if it is at most this late (e.g. after sleep)
export const SUMMARY_GRACE_MIN = 90
export const SNOOZE_MIN = 15

// Every slot (minute of the calendar day) a habit should remind at.
export function slotsOf(h) {
  const r = h.reminders
  if (!r) return []
  const out = (r.times ?? []).map((t) => ({ at: toMinutes(t), kind: 't' }))
  if (r.interval) {
    const from = toMinutes(r.interval.from)
    const to = toMinutes(r.interval.to)
    for (let m = from; m <= to; m += r.interval.every) out.push({ at: m, kind: 'i' })
  }
  return out
}

// Decide what to show now.
//   fired:   Set of slot keys already handled today (fired or skipped)
//   snoozes: { habitId: timestampMs }
// Returns reminders to show, whether to show the evening summary, and the keys
// / snoozes to record. Missed slots older than GRACE_MIN are skipped silently,
// and a habit gets at most one reminder per call even if several slots are due.
export function collectDue({ habits, log, habitDay, now, fired, snoozes = {}, settings = {} }) {
  const calDay = dayKey(now)
  const mins = now.getHours() * 60 + now.getMinutes()
  const items = new Map(dayItems(habits, log, habitDay).map((i) => [i.habit.id, i]))
  const reminders = []
  const newFired = []
  const clearedSnoozes = []

  for (const h of habits) {
    const item = items.get(h.id)

    const snoozedUntil = snoozes[h.id]
    if (snoozedUntil && now.getTime() >= snoozedUntil) {
      clearedSnoozes.push(h.id)
      if (item && !item.settled && settings.remindersEnabled !== false) {
        reminders.push({ habitId: h.id, reason: 'snooze', slot: fromMinutes(mins) })
        continue
      }
    }

    if (!item || !hasReminders(h)) continue
    const due = slotsOf(h)
      .map((s) => ({ ...s, key: `${calDay}|${h.id}|${s.kind}|${s.at}` }))
      .filter((s) => s.at <= mins && !fired.has(s.key))
    if (!due.length) continue
    for (const s of due) newFired.push(s.key)
    const latest = due.reduce((a, b) => (b.at > a.at ? b : a))
    if (settings.remindersEnabled === false || item.settled || mins - latest.at > GRACE_MIN) continue
    if (snoozes[h.id] && !clearedSnoozes.includes(h.id)) continue // snoozed: wait for the snooze
    reminders.push({ habitId: h.id, reason: latest.kind === 'i' ? 'interval' : 'time', slot: fromMinutes(latest.at) })
  }

  let summary = null
  if (settings.summaryEnabled && isTime(settings.summaryTime)) {
    const key = `${calDay}|summary`
    const at = toMinutes(settings.summaryTime)
    if (mins >= at && !fired.has(key)) {
      newFired.push(key)
      if (mins - at <= SUMMARY_GRACE_MIN) {
        const pending = [...items.values()].filter((i) => !i.settled).map((i) => i.habit.id)
        if (pending.length) summary = { pending }
      }
    }
  }

  return { reminders, summary, fired: newFired, clearedSnoozes }
}
