// Tasks service (main process): owns the task list. The Pomodoro uses it through
// ctx.getService('tasks') to pick a task as the session target and to count the
// focus sessions spent on it.
import { applyListDocs, groupByCollection, listToDocs } from '../../shared/syncDocs.js'

export default function createTasksService(ctx) {
  const tasks = () => ctx.data.get('items', [])
  const payload = () => ({ tasks: tasks() })
  const find = (id) => tasks().find((t) => t.id === id) ?? null

  // `notifyPomodoro` is false when the Pomodoro itself caused the change.
  const save = (list, { notifyPomodoro = true } = {}) => {
    ctx.data.set('items', list)
    ctx.broadcast('data', payload())
    ctx.refreshTray()
    if (notifyPomodoro) ctx.getService('pomodoro')?.refresh?.()
    return payload()
  }

  ctx.handle('get-data', () => payload())
  ctx.handle('add', (title) => {
    const clean = String(title ?? '').trim().slice(0, 200)
    if (!clean) return payload()
    return save([...tasks(), { id: crypto.randomUUID(), title: clean, done: false, pomodoros: 0, createdAt: new Date().toISOString() }])
  })
  ctx.handle('update', (id, patch) => {
    const allowed = {}
    if (typeof patch?.done === 'boolean') allowed.done = patch.done
    if (typeof patch?.title === 'string' && patch.title.trim()) allowed.title = patch.title.trim().slice(0, 200)
    return save(tasks().map((t) => (t.id === id ? { ...t, ...allowed } : t)))
  })
  ctx.handle('remove', (id) => save(tasks().filter((t) => t.id !== id)))
  ctx.handle('clear-completed', () => save(tasks().filter((t) => !t.done)))

  const pending = () => tasks().filter((t) => !t.done).length

  return {
    // Module enabled / disabled / settings changed: tell the windows and the
    // Pomodoro (its target may come back or disappear).
    start() {
      ctx.broadcast('data', payload())
      ctx.getService('pomodoro')?.refresh?.()
    },
    stop() {
      ctx.getService('pomodoro')?.refresh?.()
    },
    onSettingsChanged() {
      ctx.broadcast('data', payload())
    },
    statusLabel: () => {
      const n = pending()
      return n ? `Tareas: ${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Tareas: nada pendiente'
    },
    // Used by the Pomodoro through ctx.getService('tasks').
    api: {
      getTask: (id) => find(id),
      // One more focus session spent on this task.
      addPomodoro: (id) => {
        if (!find(id)) return
        save(tasks().map((t) => (t.id === id ? { ...t, pomodoros: (t.pomodoros ?? 0) + 1 } : t)), { notifyPomodoro: false })
      }
    },
    // Sync with the Nomos server: one document per task, in order.
    sync: {
      collections: ['tasks'],
      exportDocs: () => ({ tasks: listToDocs(tasks(), { order: true }) }),
      importDocs(changes) {
        const g = groupByCollection(changes)
        if (g.tasks) save(applyListDocs(tasks(), g.tasks, { order: true }))
      }
    },
    // For the self-test.
    debug: { find }
  }
}
