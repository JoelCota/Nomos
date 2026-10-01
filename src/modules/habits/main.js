// Habits service (main process): owns habits and their daily log, validates
// edits (only today and yesterday can be changed) and tells windows when the day
// rolls over.
import { addDays, dayItems, dayProgress, normalizeHabit, todayKey } from './logic.js'
import { SNOOZE_MIN, collectDue } from './reminders.js'
import { dayKey } from '../../shared/time.js'
import { applyListDocs, applyLogDocs, groupByCollection, listToDocs, logToDocs } from '../../shared/syncDocs.js'

export default function createHabitsService(ctx) {
  const habits = () => ctx.data.get('habits', [])
  const log = () => ctx.data.get('log', {})
  const today = () => todayKey(ctx.getSettings().dayStartHour ?? 0)

  const payload = () => ({ habits: habits(), log: log(), today: today() })
  const emit = () => {
    ctx.broadcast('data', payload())
    ctx.refreshTray()
  }

  const saveHabits = (list) => {
    ctx.data.set('habits', list)
    emit()
    return payload()
  }

  const find = (id) => habits().find((h) => h.id === id) ?? null

  const editableDay = (day) => {
    const t = today()
    return day === t || day === addDays(t, -1)
  }

  function setValue(id, day, value) {
    const h = find(id)
    if (!h) return payload()
    const d = day ?? today()
    if (!editableDay(d)) throw new Error('Solo se pueden cambiar hoy y ayer.')
    let v = Math.max(0, Math.round(Number(value) || 0))
    if (h.type === 'check') v = v > 0 ? 1 : 0
    v = Math.min(v, 100000)
    const next = { ...log() }
    const dayLog = { ...(next[d] ?? {}) }
    if (v === 0) delete dayLog[id]
    else dayLog[id] = v
    if (Object.keys(dayLog).length) next[d] = dayLog
    else delete next[d]
    ctx.data.set('log', next)
    emit()
    return payload()
  }

  const increment = (id, delta, day) => {
    const d = day ?? today()
    return setValue(id, d, (log()[d]?.[id] ?? 0) + Number(delta || 0))
  }

  function create(input) {
    const h = normalizeHabit(input)
    h.id = crypto.randomUUID()
    h.createdDay = today()
    return saveHabits([...habits(), h])
  }

  function update(id, patch) {
    const current = find(id)
    if (!current) return payload()
    const next = normalizeHabit({ ...patch, id, createdDay: current.createdDay }, current)
    return saveHabits(habits().map((h) => (h.id === id ? next : h)))
  }

  function remove(id) {
    const next = { ...log() }
    for (const d of Object.keys(next)) {
      if (next[d]?.[id] !== undefined) {
        const { [id]: _, ...rest } = next[d]
        if (Object.keys(rest).length) next[d] = rest
        else delete next[d]
      }
    }
    ctx.data.set('log', next)
    return saveHabits(habits().filter((h) => h.id !== id))
  }

  function move(id, dir) {
    const list = [...habits()]
    const i = list.findIndex((h) => h.id === id)
    const j = i + (dir < 0 ? -1 : 1)
    if (i < 0 || j < 0 || j >= list.length) return payload()
    ;[list[i], list[j]] = [list[j], list[i]]
    return saveHabits(list)
  }

  // ---- reminders ----
  // Slots already handled today and snoozes survive restarts, so nothing fires twice.
  let rem = null
  const loadRem = () => {
    const saved = ctx.data.get('reminderState', null)
    rem = { day: saved?.day ?? null, fired: new Set(saved?.fired ?? []), snoozes: saved?.snoozes ?? {} }
  }
  const saveRem = () => ctx.data.set('reminderState', { day: rem.day, fired: [...rem.fired], snoozes: rem.snoozes })
  let held = [] // reminders kept back while a Pomodoro focus is running

  const clock = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  function reminderCard(h, item, reason, slot) {
    const body =
      h.type === 'count'
        ? `Llevas ${item.value} de ${item.target}.`
        : h.type === 'duration'
          ? `Llevas ${item.value} de ${item.target} min.`
          : item.week
            ? `${item.week.count} de ${item.week.times} esta semana.`
            : reason === 'snooze'
              ? 'Te lo recuerdo otra vez.'
              : 'Aún no lo marcas hoy.'
    const primary = h.type === 'check' ? 'Hecho' : h.type === 'count' ? '+1' : '+5 min'
    return {
      appName: 'Hábitos',
      icon: h.icon,
      title: h.name,
      body,
      time: slot ?? clock(),
      sound: ctx.getSettings().reminderSound !== false,
      actions: [
        { id: 'primary', label: primary, primary: true },
        { id: 'snooze', label: `Posponer ${SNOOZE_MIN} min` }
      ]
    }
  }

  function present(x) {
    const day = today()
    if (x.kind === 'summary') {
      const items = dayItems(habits(), log(), day).filter((i) => !i.settled)
      if (!items.length) return
      const names = items.map((i) => i.habit.name)
      const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ')
      ctx.toast(
        {
          appName: 'Hábitos',
          icon: '🌙',
          title: 'Resumen del día',
          body: `${items.length === 1 ? 'Te falta 1 hábito' : `Te faltan ${items.length} hábitos`}: ${list}.`,
          time: clock(),
          sound: ctx.getSettings().reminderSound !== false,
          actions: [
            { id: 'open', label: 'Ver hábitos', primary: true },
            { id: 'dismiss', label: 'Cerrar' }
          ]
        },
        (action) => action === 'open' && ctx.openPanel('module:habits')
      )
      return
    }
    const h = find(x.habitId)
    const item = h && dayItems([h], log(), day)[0]
    if (!item || item.settled) return
    ctx.toast(reminderCard(h, item, x.reason, x.slot), (action) => {
      if (action === 'snooze') {
        rem.snoozes[h.id] = Date.now() + SNOOZE_MIN * 60 * 1000
        saveRem()
      } else if (action === 'primary') {
        if (h.type === 'check') setValue(h.id, day, 1)
        else increment(h.id, h.type === 'count' ? 1 : 5, day)
      }
    })
  }

  function tickReminders(now = new Date()) {
    if (!rem) loadRem()
    const calDay = dayKey(now)
    if (rem.day !== calDay) {
      rem = { day: calDay, fired: new Set(), snoozes: rem.snoozes }
      saveRem()
    }
    const s = ctx.getSettings()
    const r = collectDue({
      habits: habits(),
      log: log(),
      habitDay: today(),
      now,
      fired: rem.fired,
      snoozes: rem.snoozes,
      settings: { remindersEnabled: s.remindersEnabled, summaryEnabled: s.summaryEnabled, summaryTime: s.summaryTime }
    })
    r.fired.forEach((k) => rem.fired.add(k))
    r.clearedSnoozes.forEach((id) => delete rem.snoozes[id])
    if (r.fired.length || r.clearedSnoozes.length) saveRem()

    const incoming = [...r.reminders.map((x) => ({ kind: 'reminder', ...x })), ...(r.summary ? [{ kind: 'summary', ...r.summary }] : [])]
    // Hold everything while a Pomodoro focus is running; show it when the focus ends.
    if (ctx.getService('pomodoro')?.isFocusing()) {
      for (const x of incoming) {
        if (!held.some((y) => y.kind === x.kind && y.habitId === x.habitId)) held.push(x)
      }
      return
    }
    const toShow = [...held, ...incoming]
    held = []
    toShow.forEach(present)
  }

  // ---- IPC (channels are prefixed with "habits:") ----
  ctx.handle('get-data', () => payload())
  ctx.handle('create', (input) => create(input))
  ctx.handle('update', (id, patch) => update(id, patch))
  ctx.handle('remove', (id) => remove(id))
  ctx.handle('move', (id, dir) => move(id, dir))
  ctx.handle('set-value', (id, day, value) => setValue(id, day, value))
  ctx.handle('increment', (id, delta, day) => increment(id, delta, day))
  // "Probar un recordatorio" in the Control Panel.
  ctx.handle('test-reminder', () => {
    const h = habits()[0]
    if (h) {
      const item = dayItems([h], log(), today())[0] ?? { value: 0, target: 1, week: null }
      ctx.toast(reminderCard(h, item, 'time', clock()))
    } else {
      ctx.toast({ appName: 'Hábitos', icon: '⏰', title: 'Así se verán tus recordatorios', body: 'Crea un hábito y añádele una hora.', time: clock(), sound: ctx.getSettings().reminderSound !== false })
    }
  })

  // Re-broadcast when the day changes so every widget starts the new day.
  let dayTimer = null
  let lastDay = null
  const watchDay = () => {
    const t = today()
    if (t !== lastDay) {
      lastDay = t
      emit()
    }
  }
  let reminderTimer = null
  let firstTick = null

  return {
    start() {
      lastDay = today()
      clearInterval(dayTimer)
      dayTimer = setInterval(watchDay, 30 * 1000)
      clearInterval(reminderTimer)
      clearTimeout(firstTick)
      if (!ctx.isTest) {
        reminderTimer = setInterval(() => tickReminders(), 15 * 1000)
        firstTick = setTimeout(() => tickReminders(), 4000)
      }
      emit()
    },
    stop() {
      clearInterval(dayTimer)
      clearInterval(reminderTimer)
      clearTimeout(firstTick)
      dayTimer = reminderTimer = firstTick = null
      held = []
    },
    onSettingsChanged() {
      lastDay = today()
      emit()
    },
    statusLabel() {
      const p = dayProgress(habits(), log(), today())
      return p.total ? `Hábitos: ${p.done} de ${p.total} hoy` : 'Hábitos: ninguno todavía'
    },
    // Used by other modules (the Pomodoro) through ctx.getService('habits').
    api: {
      getHabit: (id) => find(id),
      durationHabits: () => habits().filter((h) => h.type === 'duration'),
      addMinutes: (id, minutes) => {
        const h = find(id)
        if (h?.type === 'duration') increment(id, minutes)
      }
    },
    // Sync with the Nomos server: one document per habit and per day/habit cell.
    sync: {
      collections: ['habits', 'habitLog'],
      exportDocs: () => ({ habits: listToDocs(habits(), { order: true }), habitLog: logToDocs(log()) }),
      importDocs(changes) {
        const g = groupByCollection(changes)
        if (g.habits) {
          const list = applyListDocs(habits(), g.habits, {
            order: true,
            normalize: (data, id) => normalizeHabit({ ...data, id }),
            onSkip: (ch, err) => ctx.log(`[habits] synced habit ${ch.id} skipped: ${err.message}`)
          })
          ctx.data.set('habits', list)
        }
        if (g.habitLog) ctx.data.set('log', applyLogDocs(log(), g.habitLog))
        emit()
      }
    },
    // For the self-test.
    debug: { payload, create, update, remove, setValue, increment, today, tickReminders, held: () => held.length, snoozes: () => ({ ...rem?.snoozes }) }
  }
}
