// Habit reminders sent from the server (Cron Trigger, every minute), so the
// phone gets them even when the PC is off. Uses the same pure logic as the
// desktop app; the PC uploads its settings (day cutoff, summary, time zone) as
// the document habitSettings/main.
import { collectDue } from '../../src/modules/habits/reminders.js'
import { dayItems, mondayOf, todayKey } from '../../src/modules/habits/logic.js'
import { dayKey } from '../../src/shared/time.js'
import { kvGet, kvSet } from './http.js'
import { pushToDevices } from './webpush.js'

const DESKTOP_ONLINE_MS = 3 * 60 * 1000

// A Date whose UTC fields are the wall-clock time in `tz`. Workers run in UTC,
// so getHours()/getDate() on it give local values — what the shared logic expects.
export function zonedNow(now, tz) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
        .formatToParts(new Date(now))
        .map((p) => [p.type, p.value])
    )
    return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second))
  } catch {
    return new Date(now)
  }
}

const docData = (r) => JSON.parse(r.data)

async function loadHabits(db, habitDay) {
  const { results: hs } = await db.prepare(`SELECT id, data FROM docs WHERE collection = 'habits' AND deleted = 0`).all()
  const habits = hs
    .map((r) => ({ ...docData(r), id: r.id }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(({ order: _o, ...h }) => h)
  // Weekly goals need the whole week so far.
  const from = mondayOf(habitDay)
  const { results: cells } = await db
    .prepare(`SELECT data FROM docs WHERE collection = 'habitLog' AND deleted = 0 AND id >= ?1 AND id < ?2`)
    .bind(`${from}|`, `${habitDay}|￿`)
    .all()
  const log = {}
  for (const r of cells) {
    const c = docData(r)
    if (c.value > 0) (log[c.day] ??= {})[c.habitId] = c.value
  }
  return { habits, log }
}

function reminderMessage(h, item) {
  const body =
    h.type === 'count'
      ? `Llevas ${item.value} de ${item.target}.`
      : h.type === 'duration'
        ? `Llevas ${item.value} de ${item.target} min.`
        : item.week
          ? `${item.week.count} de ${item.week.times} esta semana.`
          : 'Aún no lo marcas hoy.'
  return { title: `${h.icon ?? ''} ${h.name}`.trim(), body, tag: `habit-${h.id}`, url: '/' }
}

function summaryMessage(habits, pendingIds) {
  const names = pendingIds.map((id) => habits.find((h) => h.id === id)?.name).filter(Boolean)
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ')
  return {
    title: '🌙 Resumen del día',
    body: `${names.length === 1 ? 'Te falta 1 hábito' : `Te faltan ${names.length} hábitos`}: ${list}.`,
    tag: 'summary',
    url: '/'
  }
}

// Returns what it sent (for tests and logs).
export async function runReminders(env, nowMs = Date.now()) {
  const db = env.DB
  // Nobody to notify: stop before reading anything else.
  const { results: devices } = await db
    .prepare(`SELECT d.id, d.notify FROM devices d WHERE d.notify != 'never' AND EXISTS (SELECT 1 FROM push_subs s WHERE s.device_id = d.id)`)
    .all()
  if (!devices.length) return { sent: 0, reason: 'no-devices' }

  const prefsRow = await db.prepare(`SELECT data FROM docs WHERE collection = 'habitSettings' AND id = 'main' AND deleted = 0`).first()
  if (!prefsRow) return { sent: 0, reason: 'no-prefs' }
  const prefs = JSON.parse(prefsRow.data)

  const local = zonedNow(nowMs, prefs.tz || 'UTC')
  const habitDay = todayKey(prefs.dayStartHour ?? 0, local)
  const calDay = dayKey(local)
  const { habits, log } = await loadHabits(db, habitDay)

  let state = (await kvGet(db, 'reminderState')) ?? { day: null, fired: [] }
  if (state.day !== calDay) state = { day: calDay, fired: [] }
  const r = collectDue({
    habits,
    log,
    habitDay,
    now: local,
    fired: new Set(state.fired),
    settings: { remindersEnabled: prefs.remindersEnabled, summaryEnabled: prefs.summaryEnabled, summaryTime: prefs.summaryTime }
  })
  if (r.fired.length) {
    state.fired.push(...r.fired)
    await kvSet(db, 'reminderState', state)
  }

  const messages = []
  const items = new Map(dayItems(habits, log, habitDay).map((i) => [i.habit.id, i]))
  for (const x of r.reminders) {
    const h = habits.find((y) => y.id === x.habitId)
    if (h && items.get(h.id)) messages.push(reminderMessage(h, items.get(h.id)))
  }
  if (r.summary) messages.push(summaryMessage(habits, r.summary.pending))
  if (!messages.length) return { sent: 0, messages }

  // "away" devices only get it when the PC hasn't been seen for a few minutes.
  const desktopSeen = Number(await kvGet(db, 'desktopSeen')) || 0
  const desktopOnline = nowMs - desktopSeen < DESKTOP_ONLINE_MS
  const targets = devices.filter((d) => d.notify === 'always' || (d.notify === 'away' && !desktopOnline)).map((d) => d.id)
  let sent = 0
  for (const m of messages) sent += await pushToDevices(env, targets, m)
  return { sent, messages, desktopOnline, targets: targets.length }
}
