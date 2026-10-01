// Pomodoro service — runs in the main process so the timer keeps going while the
// widget is hidden. Windows only render the state broadcast on `pomodoro:state`.
import { formatTime, isToday } from '../../shared/time.js'
import { applyListDocs, groupByCollection, listToDocs } from '../../shared/syncDocs.js'

const TICK_MS = 250
const PHASE_LABELS = { work: 'Foco', short: 'Descanso corto', long: 'Descanso largo' }

// Which break follows a completed focus session. ">=" (not modulo) so lowering
// longBreakInterval mid-cycle triggers the long break right away.
const breakAfter = (completedCycles, settings) => {
  const N = Math.max(1, settings.longBreakInterval ?? 4)
  return completedCycles >= N ? 'long' : 'short'
}

export default function createPomodoroService(ctx) {
  const settings = () => ctx.getSettings()
  const dur = (phase) => (settings().durations?.[phase] ?? 25) * 60

  const initial = () => ({
    phase: 'work',
    secondsLeft: dur('work'),
    running: false,
    started: false,
    cycleCount: 0,
    currentTaskId: null
  })

  let state = initial()
  let interval = null
  let endAt = null // wall-clock ms when the running phase ends
  let pausedMs = null // exact ms left when paused

  // ---- data ----
  const tasks = () => ctx.data.get('tasks', [])
  const history = () => ctx.data.get('history', [])
  const setTasks = (t) => {
    ctx.data.set('tasks', t)
    broadcastData()
    return t
  }

  const todayStats = () => {
    const today = history().filter((h) => h.mode === 'work' && isToday(h.completedAt))
    return { count: today.length, seconds: today.reduce((a, h) => a + (h.durationSec ?? 0), 0) }
  }

  // The session target is a task id, or "habit:<id>" for a duration habit
  // (only while the Habits module is enabled).
  const HABIT_PREFIX = 'habit:'
  const resolveTarget = (id) => {
    if (!id) return null
    if (id.startsWith(HABIT_PREFIX)) {
      const habit = ctx.getService('habits')?.getHabit(id.slice(HABIT_PREFIX.length))
      return habit?.type === 'duration' ? { kind: 'habit', id: habit.id, title: `${habit.icon} ${habit.name}` } : null
    }
    const task = tasks().find((t) => t.id === id)
    return task ? { kind: 'task', id: task.id, title: task.title } : null
  }

  const snapshot = () => {
    const target = resolveTarget(state.currentTaskId)
    return {
      ...state,
      total: dur(state.phase),
      taskTitle: target?.title ?? null,
      cycleLength: Math.max(1, settings().longBreakInterval ?? 4),
      today: todayStats()
    }
  }

  const emit = () => {
    ctx.broadcast('state', snapshot())
    ctx.refreshTray()
  }
  const broadcastData = () => ctx.broadcast('data', { tasks: tasks(), history: history() })

  // ---- timer ----
  const clear = () => {
    if (interval) clearInterval(interval)
    interval = null
  }

  const runFor = (ms) => {
    clear()
    pausedMs = null
    endAt = Date.now() + ms
    interval = setInterval(tick, TICK_MS)
    state = { ...state, running: true, started: true, secondsLeft: Math.ceil(ms / 1000) }
    emit()
  }

  function tick() {
    const remaining = endAt - Date.now()
    if (remaining > 0) {
      const sec = Math.ceil(remaining / 1000)
      if (sec !== state.secondsLeft) {
        state = { ...state, secondsLeft: sec }
        emit()
      }
      return
    }
    complete()
  }

  function complete() {
    clear()
    endAt = null
    pausedMs = null
    const s = settings()
    if (state.phase === 'work') {
      const newCycle = state.cycleCount + 1
      const next = breakAfter(newCycle, s)
      recordFocus()
      state = { ...state, phase: next, cycleCount: newCycle, secondsLeft: dur(next), running: false }
      announce('workComplete', 'Foco completado', 'Buen trabajo — toca un descanso.', '¡Foco completado! Hora del descanso.')
      if (s.autoStartNext) return runFor(dur(next) * 1000)
      state = { ...state, started: false }
    } else {
      const wasLong = state.phase === 'long'
      state = {
        ...state,
        phase: 'work',
        secondsLeft: dur('work'),
        running: false,
        started: false,
        cycleCount: wasLong ? 0 : state.cycleCount
      }
      announce(
        'breakComplete',
        wasLong ? 'Descanso largo terminado' : 'Descanso terminado',
        'Empieza el siguiente ciclo.',
        'Descanso terminado — empieza el siguiente ciclo.'
      )
    }
    emit()
  }

  function recordFocus() {
    const target = resolveTarget(state.currentTaskId)
    if (target?.kind === 'task') {
      setTasks(tasks().map((t) => (t.id === target.id ? { ...t, pomodoros: (t.pomodoros ?? 0) + 1 } : t)))
    } else if (target?.kind === 'habit') {
      ctx.getService('habits')?.addMinutes(target.id, Math.round(dur('work') / 60))
    }
    ctx.data.set('history', [
      ...history(),
      {
        id: crypto.randomUUID(),
        taskId: target?.kind === 'task' ? target.id : null,
        habitId: target?.kind === 'habit' ? target.id : null,
        taskTitle: target?.title ?? 'Sin tarea',
        durationSec: dur('work'),
        mode: 'work',
        completedAt: new Date().toISOString()
      }
    ])
    broadcastData()
  }

  function announce(type, title, body, message) {
    if (settings().notificationsEnabled) ctx.notify(title, body)
    if (settings().soundEnabled) ctx.playSound('chime')
    // Visible widgets show the message.
    ctx.broadcast('event', { type, message })
  }

  const start = () => {
    if (interval) return
    const ms = pausedMs ?? state.secondsLeft * 1000
    runFor(ms > 0 ? ms : dur(state.phase) * 1000)
  }

  const pause = () => {
    if (interval && endAt) {
      pausedMs = Math.max(0, endAt - Date.now())
      state = { ...state, secondsLeft: Math.ceil(pausedMs / 1000) }
    }
    clear()
    endAt = null
    state = { ...state, running: false }
    emit()
  }

  const toggle = () => (interval ? pause() : start())

  const stopTimer = () => {
    clear()
    endAt = null
    pausedMs = null
    state = { ...state, running: false, started: false }
  }

  const reset = () => {
    stopTimer()
    state = { ...state, secondsLeft: dur(state.phase) }
    emit()
  }

  const switchPhase = (phase) => {
    if (!PHASE_LABELS[phase]) return
    stopTimer()
    state = { ...state, phase, secondsLeft: dur(phase) }
    emit()
  }

  // Skip to the next phase without recording the current one.
  const skip = () => {
    const next = state.phase === 'work' ? breakAfter(state.cycleCount + 1, settings()) : 'work'
    switchPhase(next)
  }

  const selectTask = (id) => {
    state = { ...state, currentTaskId: id || null }
    emit()
  }

  // ---- IPC (channels are prefixed with "pomodoro:") ----
  ctx.handle('get-state', () => snapshot())
  ctx.handle('toggle', () => toggle())
  ctx.handle('start', () => start())
  ctx.handle('pause', () => pause())
  ctx.handle('reset', () => reset())
  ctx.handle('skip', () => skip())
  ctx.handle('switch-phase', (phase) => switchPhase(phase))
  ctx.handle('select-task', (id) => selectTask(id))

  ctx.handle('get-data', () => ({ tasks: tasks(), history: history() }))
  ctx.handle('task-add', (title) => {
    const clean = String(title ?? '').trim().slice(0, 200)
    if (!clean) return tasks()
    return setTasks([
      ...tasks(),
      { id: crypto.randomUUID(), title: clean, done: false, pomodoros: 0, createdAt: new Date().toISOString() }
    ])
  })
  ctx.handle('task-update', (id, patch) => {
    const allowed = {}
    if (typeof patch?.done === 'boolean') allowed.done = patch.done
    if (typeof patch?.title === 'string' && patch.title.trim()) allowed.title = patch.title.trim().slice(0, 200)
    const next = setTasks(tasks().map((t) => (t.id === id ? { ...t, ...allowed } : t)))
    emit()
    return next
  })
  ctx.handle('task-remove', (id) => {
    if (state.currentTaskId === id) state = { ...state, currentTaskId: null }
    const next = setTasks(tasks().filter((t) => t.id !== id))
    emit()
    return next
  })
  ctx.handle('history-clear', () => {
    ctx.data.set('history', [])
    broadcastData()
    emit()
    return []
  })
  const setRemaining = (sec) => {
    pausedMs = null
    if (interval) endAt = Date.now() + sec * 1000
    state = { ...state, secondsLeft: sec }
    emit()
  }

  return {
    // Module enabled.
    start() {
      state = { ...initial(), currentTaskId: state.currentTaskId }
      emit()
    },
    // Module disabled: stop the timer completely.
    stop() {
      stopTimer()
      state = initial()
    },
    onSettingsChanged(next, prev) {
      const d = next.durations ?? {}
      const p = prev?.durations ?? {}
      const durationsChanged = d.work !== p.work || d.short !== p.short || d.long !== p.long
      // New durations only apply to a session that hasn't started yet.
      if (durationsChanged && !state.started && !interval) {
        pausedMs = null
        state = { ...state, secondsLeft: dur(state.phase) }
      }
      emit()
    },
    statusLabel: () => `${PHASE_LABELS[state.phase]} · ${formatTime(state.secondsLeft)}${state.running ? '' : ' (en pausa)'}`,
    trayItems: () => [
      { label: state.running ? 'Pausar' : state.started ? 'Reanudar' : 'Iniciar foco', click: toggle },
      { label: 'Reiniciar', click: reset, enabled: state.started }
    ],
    shortcuts: { 'Alt+Shift+P': toggle },
    // Used by other modules through ctx.getService('pomodoro').
    api: {
      isFocusing: () => state.phase === 'work' && state.running
    },
    // Sync with the Nomos server: tasks (in order) and finished focus sessions.
    sync: {
      collections: ['tasks', 'focusSessions'],
      exportDocs: () => ({ tasks: listToDocs(tasks(), { order: true }), focusSessions: listToDocs(history()) }),
      importDocs(changes) {
        const g = groupByCollection(changes)
        if (g.tasks) ctx.data.set('tasks', applyListDocs(tasks(), g.tasks, { order: true }))
        if (g.focusSessions) ctx.data.set('history', applyListDocs(history(), g.focusSessions, { sortBy: (h) => h.completedAt ?? '' }))
        broadcastData()
        emit()
      }
    },
    // For the self-test.
    debug: { snapshot, toggle, start, pause, reset, selectTask, setRemaining, switchPhase }
  }
}
