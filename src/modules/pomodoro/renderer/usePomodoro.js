import { invoke } from '../../../renderer/src/lib/ipc'
import useIpcState from '../../../renderer/src/hooks/useIpcState'

export const PHASE_LABELS = { work: 'Foco', short: 'Descanso', long: 'Descanso largo' }

export const pomodoro = {
  toggle: () => invoke('pomodoro:toggle'),
  start: () => invoke('pomodoro:start'),
  pause: () => invoke('pomodoro:pause'),
  reset: () => invoke('pomodoro:reset'),
  skip: () => invoke('pomodoro:skip'),
  selectTask: (id) => invoke('pomodoro:select-task', id),
  addTask: (title) => invoke('pomodoro:task-add', title),
  updateTask: (id, patch) => invoke('pomodoro:task-update', id, patch),
  removeTask: (id) => invoke('pomodoro:task-remove', id),
  clearHistory: () => invoke('pomodoro:history-clear')
}

// Timer state (owned by the main process).
export const usePomodoroState = () => useIpcState('pomodoro:get-state', 'pomodoro:state')

// Tasks and history.
export const usePomodoroData = () => useIpcState('pomodoro:get-data', 'pomodoro:data', { tasks: [], history: [] })
