import { openPanel } from '../../../renderer/src/lib/ipc'
import ProgressRing from '../../../renderer/src/ui/ProgressRing'
import { usePomodoroState } from '../../pomodoro/renderer/usePomodoro'
import { selectPomodoroTask, tasksApi, useTasksData } from './useTasks'

function CheckMark({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path d="M1.5 5.2l2.3 2.3L8.5 2.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Row({ task, current, canFocus }) {
  return (
    <div data-testid="task-widget-row" className={`flex h-[28px] items-center gap-2.5 ${task.done ? 'opacity-55' : ''}`}>
      <button
        type="button"
        onClick={() => tasksApi.update(task.id, { done: !task.done })}
        title={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        aria-label={task.done ? `Marcar ${task.title} como pendiente` : `Marcar ${task.title} como hecha`}
        aria-pressed={task.done}
        className={`no-drag flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition ${
          task.done ? 'border-accent bg-accent text-white' : 'border-[var(--track)] text-transparent hover:border-accent hover:text-accent'
        }`}
      >
        <CheckMark size={9} />
      </button>
      <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${task.done ? 'line-through' : ''} ${current ? 'text-accent' : ''}`}>{task.title}</span>
      {(task.pomodoros ?? 0) > 0 && (
        <span className="tnum shrink-0 text-[12px] text-fg-3" title="Focos completados">
          {task.pomodoros} 🍅
        </span>
      )}
      {canFocus && !task.done && (
        <button
          type="button"
          onClick={() => selectPomodoroTask(current ? null : task.id)}
          title={current ? 'Quitar del Pomodoro' : 'Trabajar en esta tarea con el Pomodoro'}
          aria-label={current ? `Quitar ${task.title} del Pomodoro` : `Trabajar en ${task.title} con el Pomodoro`}
          aria-pressed={current}
          className={`no-drag flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition ${
            current ? 'bg-accent text-white' : 'bg-[var(--track)] text-fg-2 hover:text-fg'
          }`}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.6l7.2 4.4L3 10.4z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  )
}

function EmptyState({ compact }) {
  return (
    <div data-testid="tasks-widget" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="text-[26px]" aria-hidden>
        📋
      </span>
      {!compact && <p className="text-[13px] text-fg-2">No tienes tareas.</p>}
      <button
        type="button"
        onClick={() => openPanel('module:tasks')}
        className="no-drag rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:brightness-110"
      >
        Añadir una tarea
      </button>
    </div>
  )
}

export default function TasksWidget({ size, settings, config }) {
  const data = useTasksData()
  const pomodoro = usePomodoroState()
  if (!data) return <div data-testid="tasks-widget" />
  if (!data.tasks.length) return <EmptyState compact={size === 'small'} />

  const canFocus = !!config?.modules.pomodoro?.enabled
  const currentId = canFocus ? pomodoro?.currentTaskId : null
  const pending = data.tasks.filter((t) => !t.done)
  const done = data.tasks.length - pending.length
  const summary = pending.length ? `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}` : '¡Todo hecho!'

  if (size === 'small') {
    return (
      <div data-testid="tasks-widget" className="flex h-full flex-col p-3.5">
        <span className="text-[13px] font-semibold text-accent">Tareas</span>
        <div className="flex flex-1 items-center justify-center">
          <ProgressRing value={done / data.tasks.length} size={84} stroke={7} color="var(--accent)">
            <span className="tnum text-[22px] font-semibold leading-none">{pending.length}</span>
            <span className="mt-1 text-[10px] text-fg-3">{pending.length === 1 ? 'pendiente' : 'pendientes'}</span>
          </ProgressRing>
        </div>
        <p className="truncate text-center text-[11px] text-fg-2">{pending[0]?.title ?? 'Todo hecho'}</p>
      </div>
    )
  }

  // Pending first, then the completed ones (unless hidden).
  let items = [...pending, ...data.tasks.filter((t) => t.done)]
  if (settings?.showCompleted === false) items = pending
  const large = size === 'large'

  return (
    <div data-testid="tasks-widget" className={`flex h-full flex-col ${large ? 'p-4' : 'px-4 py-3'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-accent">Tareas</span>
        <span className="flex items-center gap-2">
          <span className="tnum text-[12px] text-fg-3">{summary}</span>
          <button
            type="button"
            onClick={() => openPanel('module:tasks')}
            title="Añadir o editar tareas"
            aria-label="Añadir o editar tareas"
            className="no-drag flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--track)] text-[13px] leading-none text-fg-2 hover:text-fg"
          >
            +
          </button>
        </span>
      </div>
      <div
        className="no-drag mt-1 min-h-0 flex-1 overflow-y-auto pr-0.5"
        style={items.length > (large ? 10 : 4) ? { maskImage: 'linear-gradient(to bottom, black calc(100% - 16px), transparent)' } : undefined}
      >
        {items.length ? (
          items.map((t) => <Row key={t.id} task={t} current={t.id === currentId} canFocus={canFocus} />)
        ) : (
          <p className="pt-4 text-center text-[12px] text-fg-3">¡Todo hecho!</p>
        )}
      </div>
    </div>
  )
}
