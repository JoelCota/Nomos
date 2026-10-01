import { useMemo, useState } from 'react'
import { selectTasks, useStore, write } from '../store'
import { Banner, Header, Sheet, haptic } from '../ui'

const save = (t) => {
  const { id, ...data } = t
  write('tasks', id, data)
}

export default function Tasks() {
  const st = useStore()
  const tasks = useMemo(() => selectTasks(st.docs), [st.docs])
  const [title, setTitle] = useState('')
  const [sheet, setSheet] = useState(null)
  const pending = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  const add = (e) => {
    e.preventDefault()
    const clean = title.trim().slice(0, 200)
    if (!clean) return
    const order = tasks.reduce((m, t) => Math.max(m, t.order ?? 0), -1) + 1
    save({ id: crypto.randomUUID(), title: clean, done: false, pomodoros: 0, createdAt: new Date().toISOString(), order })
    setTitle('')
  }
  const toggle = (t) => {
    haptic()
    save({ ...t, done: !t.done })
  }

  const row = (t) => (
    <div key={t.id} data-testid="task-row" className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <button
        type="button"
        aria-label={t.done ? `Marcar «${t.title}» como pendiente` : `Completar «${t.title}»`}
        aria-pressed={t.done}
        onClick={() => toggle(t)}
        className={`press flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 ${t.done ? 'border-accent bg-accent text-white' : 'border-fg-3/40'}`}
      >
        {t.done && (
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button type="button" onClick={() => setSheet(t)} className="press min-w-0 flex-1 text-left">
        <span className={`block text-[17px] ${t.done ? 'text-fg-3 line-through' : ''}`}>{t.title}</span>
        {t.pomodoros > 0 && <span className="text-[13px] text-fg-3">🍅 {t.pomodoros}</span>}
      </button>
    </div>
  )

  return (
    <>
      <Header title="Tareas" subtitle={pending.length ? `${pending.length} pendiente${pending.length === 1 ? '' : 's'}` : 'Todo al día'} />
      {!st.online && <Banner>Sin conexión. Tus cambios se enviarán al volver.</Banner>}
      <form onSubmit={add} className="mx-4 mb-6 flex items-center gap-2 rounded-[14px] bg-card py-1.5 pl-4 pr-1.5">
        <input
          data-testid="task-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva tarea"
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-fg-3"
        />
        <button type="submit" data-testid="task-add" disabled={!title.trim()} className="press rounded-[10px] bg-accent px-3.5 py-2 text-[15px] font-semibold text-white disabled:opacity-30">
          Agregar
        </button>
      </form>

      {pending.length > 0 && <div className="mx-4 mb-6 divide-y divide-line overflow-hidden rounded-[14px] bg-card">{pending.map(row)}</div>}
      {done.length > 0 && (
        <>
          <div className="mx-4 mb-1.5 flex items-baseline justify-between px-4">
            <h2 className="text-[13px] uppercase tracking-wide text-fg-3">Completadas</h2>
            <button type="button" onClick={() => done.forEach((t) => write('tasks', t.id, null))} className="press text-[15px] text-accent">
              Borrar
            </button>
          </div>
          <div className="mx-4 mb-6 divide-y divide-line overflow-hidden rounded-[14px] bg-card">{done.map(row)}</div>
        </>
      )}
      {tasks.length === 0 && <p className="mx-6 mt-6 text-center text-[16px] text-fg-3">Sin tareas. Las que agregues aquí aparecen en el Pomodoro de tu PC.</p>}

      {sheet && (
        <Sheet
          title={sheet.title}
          actions={[
            { label: sheet.done ? 'Marcar como pendiente' : 'Completar', onClick: () => toggle(sheet) },
            { label: 'Eliminar', danger: true, onClick: () => write('tasks', sheet.id, null) }
          ]}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
