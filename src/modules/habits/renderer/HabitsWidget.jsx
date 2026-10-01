import { openPanel } from '../../../renderer/src/lib/ipc'
import ProgressRing from '../../../renderer/src/ui/ProgressRing'
import { WEEKDAY_LETTERS, dayProgress, perfectStreak, progressText, recentDays } from '../logic'
import { quickAction, useHabitsData } from './useHabits'

const actionLabel = ({ habit: h, done }) =>
  h.type === 'check' ? (done ? `Desmarcar ${h.name}` : `Marcar ${h.name} como hecho`) : h.type === 'count' ? `Sumar 1 a ${h.name}` : `Sumar 5 minutos a ${h.name}`

function CheckMark({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path d="M1.5 5.2l2.3 2.3L8.5 2.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// One-click action: check / +1 / +5 min. Count and duration habits show their
// progress as a small ring around the button.
function ActionButton({ item, day }) {
  const { habit: h, value, target, done } = item
  const label = actionLabel(item)
  const common = 'no-drag relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition'
  if (h.type === 'check') {
    return (
      <button
        type="button"
        onClick={() => quickAction(item, day)}
        title={label}
        aria-label={label}
        aria-pressed={done}
        className={`${common} ${done ? 'bg-accent text-white' : 'border-2 border-[var(--track)] text-transparent hover:border-accent hover:text-accent'}`}
      >
        <CheckMark />
      </button>
    )
  }
  const r = 11
  const c = 2 * Math.PI * r
  const frac = Math.min(1, value / target)
  return (
    <button type="button" onClick={() => quickAction(item, day)} title={label} aria-label={label} className={`${common} hover:bg-[var(--track)]`}>
      <svg width="26" height="26" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--track)" strokeWidth="2.5" />
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className={`relative text-[10px] font-bold ${done ? 'text-accent' : 'text-fg-2'}`}>
        {done ? <CheckMark size={9} /> : h.type === 'count' ? '+1' : '+5'}
      </span>
    </button>
  )
}

// Last 7 days: filled = done, soft = required but missed, outline = not required.
function MiniGrid({ habit, log, today }) {
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {recentDays(habit, log, today, 7).map((d) => (
        <span
          key={d.day}
          title={d.day}
          className={`h-[9px] w-[9px] rounded-[3px] ${
            d.done ? 'bg-accent' : d.required ? 'bg-[var(--track)]' : 'border border-[var(--track)]'
          } ${d.active ? '' : 'opacity-30'}`}
        />
      ))}
    </div>
  )
}

function Row({ item, day, log, large }) {
  const h = item.habit
  const text = progressText(item)
  return (
    <div data-testid="habit-row" className={`flex items-center gap-2.5 ${large ? 'h-[36px]' : 'h-[26px]'} ${item.settled ? 'opacity-55' : ''}`}>
      <span className="w-5 shrink-0 text-center text-[15px]" aria-hidden>
        {h.icon}
      </span>
      {large ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">{h.name}</p>
          {text && <p className="tnum text-[11px] leading-tight text-fg-3">{text}</p>}
        </div>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.name}</span>
          {text && <span className="tnum shrink-0 text-[12px] text-fg-3">{text}</span>}
        </>
      )}
      {large && <MiniGrid habit={h} log={log} today={day} />}
      <ActionButton item={item} day={day} />
    </div>
  )
}

function EmptyState({ compact }) {
  return (
    <div data-testid="habits-widget" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="text-[26px]" aria-hidden>
        🌱
      </span>
      {!compact && <p className="text-[13px] text-fg-2">Todavía no tienes hábitos.</p>}
      <button
        type="button"
        onClick={() => openPanel('module:habits')}
        className="no-drag rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:brightness-110"
      >
        Crear un hábito
      </button>
    </div>
  )
}

export default function HabitsWidget({ size, settings }) {
  const data = useHabitsData()
  if (!data) return <div data-testid="habits-widget" />
  if (!data.habits.length) return <EmptyState compact={size === 'small'} />

  const { habits, log, today } = data
  const progress = dayProgress(habits, log, today)
  const perfect = perfectStreak(habits, log, today)
  const streakLine = perfect > 0 ? `🔥 ${perfect} ${perfect === 1 ? 'día perfecto' : 'días perfectos'}` : 'Completa hoy para empezar tu racha'
  const summary = progress.total ? `${progress.done} de ${progress.total}` : 'Nada para hoy'

  if (size === 'small') {
    const allDone = progress.total > 0 && progress.done === progress.total
    return (
      <div data-testid="habits-widget" className="flex h-full flex-col p-3.5">
        <span className="text-[13px] font-semibold text-accent">Hábitos</span>
        <div className="flex flex-1 items-center justify-center">
          <ProgressRing value={progress.total ? progress.done / progress.total : 0} size={84} stroke={7} color="var(--accent)">
            <span className="tnum text-[20px] font-semibold leading-none">
              {progress.done}/{progress.total}
            </span>
            <span className="mt-1 text-[10px] text-fg-3">{allDone ? 'listo' : 'hoy'}</span>
          </ProgressRing>
        </div>
        <p className="truncate text-center text-[11px] text-fg-2">{perfect > 0 ? `🔥 ${perfect} ${perfect === 1 ? 'día' : 'días'}` : 'Sin racha aún'}</p>
      </div>
    )
  }

  // Pending first, then the ones already settled for today.
  let items = [...progress.items.filter((i) => !i.settled), ...progress.items.filter((i) => i.settled)]
  if (settings.showCompleted === false) items = items.filter((i) => !i.settled)
  const large = size === 'large'

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() - i)
    days.push(WEEKDAY_LETTERS[d.getDay()])
  }

  return (
    <div data-testid="habits-widget" className={`flex h-full flex-col ${large ? 'p-4' : 'px-4 py-3'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-accent">Hoy</span>
        <span className="tnum text-[12px] text-fg-3">{summary}</span>
      </div>
      {large && (
        <>
          <p className="mt-0.5 text-[12px] text-fg-2">{streakLine}</p>
          <div className="mt-2 flex items-center gap-2.5 pr-[36px]" aria-hidden>
            <span className="flex-1" />
            <div className="flex gap-[3px]">
              {days.map((l, i) => (
                <span key={i} className={`w-[9px] text-center text-[8px] font-semibold ${i === 6 ? 'text-accent' : 'text-fg-3'}`}>
                  {l}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      <div
        className="no-drag mt-1 min-h-0 flex-1 overflow-y-auto pr-0.5"
        style={items.length > (large ? 7 : 4) ? { maskImage: 'linear-gradient(to bottom, black calc(100% - 16px), transparent)' } : undefined}
      >
        {items.length ? (
          items.map((item) => <Row key={item.habit.id} item={item} day={today} log={log} large={large} />)
        ) : (
          <p className="pt-4 text-center text-[12px] text-fg-3">
            {progress.total ? '¡Todo hecho por hoy!' : 'No hay hábitos programados para hoy.'}
          </p>
        )}
      </div>
      {!large && progress.total > 0 && <span className="sr-only">{streakLine}</span>}
    </div>
  )
}
