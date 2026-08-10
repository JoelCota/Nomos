import { useState } from 'react'

export default function TasksView({ tasks, currentTaskId, onSelectTask, onAdd, onUpdate, onDelete }) {
  const [draft, setDraft] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    onAdd(title)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-white transition-colors hover:opacity-90"
        >
          Add
        </button>
      </form>

      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        Click a task to assign it to the current session.
      </p>

      <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">No tasks yet.</p>
        )}
        {tasks.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectTask(t.id === currentTaskId ? null : t.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
              t.id === currentTaskId
                ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:bg-neutral-900'
            } ${t.done ? 'opacity-50' : ''}`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUpdate(t.id, { done: !t.done })
              }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                t.done
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-neutral-400 hover:border-[var(--accent)] dark:border-neutral-600'
              }`}
            >
              {t.done && (
                <svg width="9" height="9" viewBox="0 0 10 10">
                  <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <span className={`min-w-0 flex-1 truncate text-xs ${t.done ? 'line-through' : ''}`}>
              {t.title}
            </span>
            <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {t.pomodoros}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(t.id)
              }}
              className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
              title="Delete task"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
