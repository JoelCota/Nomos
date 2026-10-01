// Simple actions for Siri / iOS Shortcuts (Atajos): one request, plain answers.
//   POST /api/quick/task   { title }                -> adds a task
//   POST /api/quick/habit  { habit, amount? }        -> marks a habit (or adds to it)
//   GET  /api/quick/today                           -> how today is going
// Every answer has a `message` meant to be shown or spoken by the shortcut.
import { dayItems, progressText, todayKey } from '../../src/modules/habits/logic.js'
import { HttpError } from './http.js'
import { push } from './docs.js'
import { loadHabits, zonedNow } from './reminders.js'

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Dictation often adds a final period or capitalizes oddly; keep the text otherwise.
const cleanTitle = (t) =>
  String(t ?? '')
    .trim()
    .replace(/[.。]+$/, '')
    .slice(0, 200)

const listText = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0] ?? '')

async function habitDay(db, now) {
  const row = await db.prepare(`SELECT data FROM docs WHERE collection = 'habitSettings' AND id = 'main' AND deleted = 0`).first()
  const s = row ? JSON.parse(row.data) : {}
  return todayKey(s.dayStartHour ?? 0, zonedNow(now, s.tz || 'UTC'))
}

export async function quickTask(db, body, device, now = Date.now()) {
  const title = cleanTitle(body?.title ?? body?.tarea ?? body?.text)
  if (!title) throw new HttpError(400, 'Dime el nombre de la tarea.')
  const maxOrder = await db
    .prepare(`SELECT MAX(CAST(json_extract(data, '$.order') AS REAL)) AS m FROM docs WHERE collection = 'tasks' AND deleted = 0`)
    .first('m')
  const task = { title, done: false, pomodoros: 0, createdAt: new Date(now).toISOString(), order: Math.floor(maxOrder ?? -1) + 1 }
  const id = crypto.randomUUID()
  await push(db, { device, changes: [{ collection: 'tasks', id, data: task, updatedAt: now }] })
  return { ok: true, message: `Listo, agregué «${title}» a tus tareas.`, task: { id, ...task } }
}

// Exact name first, then "starts with", then "contains" (accents and case ignored).
export function findHabit(habits, query) {
  const q = fold(query)
  if (!q) return null
  const named = habits.map((h) => ({ h, n: fold(h.name) }))
  return (
    named.find((x) => x.n === q)?.h ??
    named.find((x) => x.n.startsWith(q) || q.startsWith(x.n))?.h ??
    named.find((x) => x.n.includes(q) || q.includes(x.n))?.h ??
    null
  )
}

export async function quickHabit(db, body, device, now = Date.now()) {
  const day = await habitDay(db, now)
  const { habits, log } = await loadHabits(db, day)
  const query = body?.habit ?? body?.habito ?? body?.name
  const h = findHabit(habits, query)
  if (!h) {
    const names = habits.map((x) => x.name)
    throw new HttpError(404, names.length ? `No encontré «${String(query ?? '').trim()}». Tus hábitos son: ${listText(names)}.` : 'Todavía no tienes hábitos.')
  }
  const current = log[day]?.[h.id] ?? 0
  const amount = Number(body?.amount ?? body?.cantidad)
  let value
  if (h.type === 'check') {
    if (current >= 1) return { ok: true, message: `${h.name} ya estaba hecho hoy.`, habit: h.name, value: current }
    value = 1
  } else {
    const step = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : h.type === 'duration' ? 5 : 1
    value = Math.min(current + step, 100000)
  }
  await push(db, { device, changes: [{ collection: 'habitLog', id: `${day}|${h.id}`, data: { day, habitId: h.id, value }, updatedAt: now }] })
  const item = dayItems([h], { ...log, [day]: { ...(log[day] ?? {}), [h.id]: value } }, day)[0]
  const progress = item ? progressText(item) : ''
  const message =
    h.type === 'check'
      ? `Listo, marqué ${h.name}.${item?.week ? ` Llevas ${item.week.count} de ${item.week.times} esta semana.` : ''}`
      : `Listo: ${h.name} ${progress.replace('/', ' de ')}.${item?.done ? ' ¡Meta cumplida!' : ''}`
  return { ok: true, message, habit: h.name, value }
}

export async function quickToday(db, now = Date.now()) {
  const day = await habitDay(db, now)
  const { habits, log } = await loadHabits(db, day)
  const items = dayItems(habits, log, day)
  if (!items.length) return { ok: true, message: 'Hoy no tienes hábitos pendientes.', done: 0, total: 0 }
  const done = items.filter((i) => i.settled).length
  const pending = items.filter((i) => !i.settled).map((i) => i.habit.name)
  const message = pending.length
    ? `Llevas ${done} de ${items.length} hábitos. Te ${pending.length === 1 ? 'falta' : 'faltan'}: ${listText(pending)}.`
    : `¡Completaste tus ${items.length} hábitos de hoy!`
  return { ok: true, message, done, total: items.length, pending }
}
