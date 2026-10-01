import { useEffect, useRef, useState } from 'react'
import { on } from '../../../renderer/src/lib/ipc'
import { formatTime } from '../../../shared/time'
import ProgressRing from '../../../renderer/src/ui/ProgressRing'
import { PHASE_LABELS, pomodoro, usePomodoroState } from './usePomodoro'

function PlayIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1.6l7.2 4.4L3 10.4z" fill="currentColor" />
    </svg>
  )
}
function PauseIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <rect x="2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" />
      <rect x="7.2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" />
    </svg>
  )
}
function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function SkipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 3l7 5-7 5z" fill="currentColor" />
      <rect x="11.5" y="3" width="1.8" height="10" rx="0.9" fill="currentColor" />
    </svg>
  )
}

// Dots for the focus sessions completed in the current cycle.
function CycleDots({ done, total }) {
  return (
    <span data-testid="cycle-indicator" className="inline-flex items-center gap-[4px]" aria-label={`${done} de ${total} focos del ciclo`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          data-cycle-pip
          data-filled={i < done}
          className={`h-[5px] w-[5px] rounded-full ${i < done ? 'bg-accent' : 'bg-[var(--track)]'}`}
        />
      ))}
    </span>
  )
}

function IconButton({ onClick, label, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`no-drag flex h-8 w-8 items-center justify-center rounded-full bg-[var(--track)] text-fg-2 transition hover:text-fg ${className}`}
    >
      {children}
    </button>
  )
}

function PrimaryButton({ state, compact = false }) {
  const label = state.running ? 'Pausar' : state.started ? 'Reanudar' : 'Iniciar'
  if (compact) {
    return (
      <button
        type="button"
        onClick={pomodoro.toggle}
        title={label}
        aria-label={label}
        className="no-drag flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-110"
      >
        {state.running ? <PauseIcon /> : <PlayIcon />}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={pomodoro.toggle}
      className="no-drag flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-white transition hover:brightness-110"
    >
      {state.running ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
      {label}
    </button>
  )
}

// Transient message after a phase ends (the chime is played by the main process).
function useAlert() {
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  useEffect(() => {
    const off = on('pomodoro:event', (e) => {
      clearTimeout(timer.current)
      setMsg(e.message)
      timer.current = setTimeout(() => setMsg(null), 4500)
    })
    return () => {
      off()
      clearTimeout(timer.current)
    }
  }, [])
  return msg
}

export default function PomodoroWidget({ size }) {
  const state = usePomodoroState()
  const alert = useAlert()
  if (!state) return <div data-testid="pomodoro-widget" />

  const isBreak = state.phase !== 'work'
  const color = isBreak ? 'var(--break)' : 'var(--accent)'
  const progress = state.total > 0 ? state.secondsLeft / state.total : 0
  const done = Math.min(state.cycleCount, state.cycleLength)
  const phase = (
    <span data-testid="pomodoro-phase" className="text-[13px] font-semibold" style={{ color }}>
      {PHASE_LABELS[state.phase]}
    </span>
  )
  const time = formatTime(state.secondsLeft)
  const todayLine =
    state.today.count === 0
      ? 'Aún no hay focos hoy'
      : `${state.today.count} ${state.today.count === 1 ? 'foco' : 'focos'} hoy, ${Math.round(state.today.seconds / 60)} min`

  const alertEl = alert && (
    <div
      role="status"
      className="absolute inset-x-2.5 top-2.5 z-10 rounded-xl bg-fg px-3 py-2 text-center text-[12px] font-medium text-[var(--panel-bg)] shadow-lg"
      style={{ animation: 'alertIn 180ms ease-out' }}
    >
      {alert}
    </div>
  )

  if (size === 'small') {
    return (
      <div data-testid="pomodoro-widget" className="relative flex h-full flex-col p-3.5">
        {alertEl}
        <div className="flex items-center justify-between">
          {phase}
          <CycleDots done={done} total={state.cycleLength} />
        </div>
        <div className="flex flex-1 items-center justify-center pb-3">
          <ProgressRing value={progress} size={84} stroke={7} color={color}>
            <span className="tnum text-[20px] font-semibold tracking-tight">{time}</span>
          </ProgressRing>
        </div>
        <div className="absolute bottom-3 right-3">
          <PrimaryButton state={state} compact />
        </div>
      </div>
    )
  }

  if (size === 'large') {
    return (
      <div data-testid="pomodoro-widget" className="relative flex h-full flex-col items-center p-5">
        {alertEl}
        <div className="flex w-full items-center justify-between">
          {phase}
          <CycleDots done={done} total={state.cycleLength} />
        </div>
        <div className="mt-2">
          <ProgressRing value={progress} size={160} stroke={10} color={color}>
            <span className="tnum text-[38px] font-semibold leading-none tracking-tight">{time}</span>
            <span className="mt-1.5 text-[12px] text-fg-3">{state.running ? 'en curso' : state.started ? 'en pausa' : `de ${Math.round(state.total / 60)} min`}</span>
          </ProgressRing>
        </div>
        <p className="mt-2.5 max-w-full truncate text-[13px] text-fg-2">{state.taskTitle ?? 'Sin objetivo'}</p>
        <div className="mt-3 flex items-center gap-3">
          <IconButton label="Reiniciar" onClick={pomodoro.reset}>
            <ResetIcon />
          </IconButton>
          <PrimaryButton state={state} />
          <IconButton label="Saltar a la siguiente fase" onClick={pomodoro.skip}>
            <SkipIcon />
          </IconButton>
        </div>
        <p className="mt-auto pt-2 text-[12px] text-fg-3">{todayLine}</p>
      </div>
    )
  }

  // medium
  return (
    <div data-testid="pomodoro-widget" className="relative flex h-full items-center gap-5 px-5">
      {alertEl}
      <ProgressRing value={progress} size={118} stroke={8} color={color}>
        <span className="tnum text-[26px] font-semibold leading-none tracking-tight">{time}</span>
        <span className="mt-1 text-[11px] text-fg-3">{state.running ? 'en curso' : state.started ? 'en pausa' : `de ${Math.round(state.total / 60)} min`}</span>
      </ProgressRing>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {phase}
          <CycleDots done={done} total={state.cycleLength} />
        </div>
        <p className="truncate text-[13px] text-fg-2">{state.taskTitle ?? 'Sin objetivo'}</p>
        <div className="flex items-center gap-2">
          <PrimaryButton state={state} />
          <IconButton label="Reiniciar" onClick={pomodoro.reset}>
            <ResetIcon />
          </IconButton>
        </div>
        <p className="text-[12px] text-fg-3">{todayLine}</p>
      </div>
    </div>
  )
}
