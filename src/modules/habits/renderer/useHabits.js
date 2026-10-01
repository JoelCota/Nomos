import { invoke } from '../../../renderer/src/lib/ipc'
import useIpcState from '../../../renderer/src/hooks/useIpcState'

// Habits data owned by the main process: { habits, log, today }.
export const useHabitsData = () => useIpcState('habits:get-data', 'habits:data')

// Strip Electron's "Error invoking remote method…" prefix to show our own message.
export const errorText = (e) => String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const habitsApi = {
  create: (habit) => invoke('habits:create', habit),
  update: (id, patch) => invoke('habits:update', id, patch),
  remove: (id) => invoke('habits:remove', id),
  move: (id, dir) => invoke('habits:move', id, dir),
  setValue: (id, day, value) => invoke('habits:set-value', id, day, value),
  increment: (id, delta, day) => invoke('habits:increment', id, delta, day)
}

// The one-click action of a habit: check/uncheck, +1, or +5 minutes.
export function quickAction(item, day) {
  const { habit: h, value } = item
  if (h.type === 'check') return habitsApi.setValue(h.id, day, value > 0 ? 0 : 1)
  if (h.type === 'count') return habitsApi.increment(h.id, 1, day)
  return habitsApi.increment(h.id, 5, day)
}
