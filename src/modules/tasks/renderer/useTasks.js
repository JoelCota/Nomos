import { invoke } from '../../../renderer/src/lib/ipc'
import useIpcState from '../../../renderer/src/hooks/useIpcState'

export const tasksApi = {
  add: (title) => invoke('tasks:add', title),
  update: (id, patch) => invoke('tasks:update', id, patch),
  remove: (id) => invoke('tasks:remove', id),
  clearCompleted: () => invoke('tasks:clear-completed')
}

// Task list owned by the main process: { tasks }.
export const useTasksData = () => useIpcState('tasks:get-data', 'tasks:data')

// The Pomodoro picks the session target; used to highlight it and to start a focus.
export const selectPomodoroTask = (id) => invoke('pomodoro:select-task', id)
