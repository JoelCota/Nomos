import { useState } from 'react'
import { Group } from '../../../renderer/src/ui/controls'
import { tasksApi } from './useTasks'

// The editable task list, shared by the Tareas page and the Pomodoro's Tareas tab.
export default function TasksList({ tasks, currentTaskId }) {
  const [draft, setDraft] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    tasksApi.add(draft)
    setDraft('')
  }
  const hasDone = tasks.some((t) => t.done)

  return (
    <>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nueva tarea"
          aria-label="Nueva tarea"
          className="min-w-0 flex-1 rounded-lg bg-group px-3 py-2 text-[13px] text-fg outline-none placeholder:text-fg-3 focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 text-[13px] font-semibold text-white hover:brightness-110">
          Añadir
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-fg-3">Añade una tarea. En el Pomodoro puedes elegirla como objetivo para contar los focos que le dedicas.</p>
      ) : (
        <Group>
          {tasks.map((t) => (
            <div key={t.id} data-testid="task-row" className={`flex items-center gap-3 px-4 py-2.5 ${t.done ? 'opacity-55' : ''}`}>
              <button
                type="button"
                aria-label={t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
                onClick={() => tasksApi.update(t.id, { done: !t.done })}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                  t.done ? 'border-accent bg-accent text-white' : 'border-fg-3 hover:border-accent'
                }`}
              >
                {t.done && (
                  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                    <path d="M1.5 5.2l2.3 2.3L8.5 2.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <span className={`min-w-0 flex-1 truncate text-[13px] ${t.done ? 'line-through' : ''}`}>{t.title}</span>
              {t.id === currentTaskId && <span className="text-[12px] font-medium text-accent">En la sesión</span>}
              <span className="tnum text-[12px] text-fg-3" title="Focos completados">
                {t.pomodoros ?? 0} 🍅
              </span>
              <button
                type="button"
                onClick={() => tasksApi.remove(t.id)}
                aria-label={`Eliminar ${t.title}`}
                className="rounded p-1 text-fg-3 hover:text-red-500"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>
          ))}
        </Group>
      )}
      {hasDone && (
        <button type="button" onClick={tasksApi.clearCompleted} className="mt-3 text-[12px] font-medium text-accent hover:underline">
          Borrar las completadas
        </button>
      )}
    </>
  )
}
