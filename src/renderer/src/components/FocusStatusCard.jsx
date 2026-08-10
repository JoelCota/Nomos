import { formatTime } from '../lib/format'

const PHASE_LABELS = { work: 'FOCUS TIME', short: 'BREAK TIME', long: 'BREAK TIME' }

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="1.5" y="1" width="3" height="10" rx="1" fill="currentColor" />
      <rect x="7.5" y="1" width="3" height="10" rx="1" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M3 1.5l7.5 4.5L3 10.5z" fill="currentColor" />
    </svg>
  )
}

export default function FocusStatusCard({ timer, taskTitle, cycleLength }) {
  const { phase, secondsLeft, running, toggle, cycleCount } = timer
  const label = PHASE_LABELS[phase] ?? 'FOCUS TIME'
  const N = Math.max(1, cycleLength ?? 4)
  const done = Math.min(cycleCount, N)
  const current = Math.min(cycleCount + 1, N)

  return (
    <div
      data-testid="focus-card"
      className="flex items-center gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[#1d1d22] px-4 py-3"
      style={{ boxShadow: '0 0 20px rgba(0,0,0,0.35)', WebkitAppRegion: 'drag' }}
    >
      <div className="relative h-7 w-7 shrink-0">
        <svg viewBox="0 0 28 28" className="h-full w-full">
          <circle cx="14" cy="14" r="11.5" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1.5" />
          <circle
            cx="14"
            cy="14"
            r="7"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="3.5 4.5"
            style={{ animation: 'spinSlow 8s linear infinite', transformOrigin: '50% 50%' }}
          />
          <circle cx="14" cy="14" r="2" fill="var(--accent)" />
        </svg>
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <div className="text-[9px] font-bold tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
            {label}
          </div>
          <span data-testid="cycle-indicator" className="inline-flex items-center gap-[3px]">
            {Array.from({ length: N }).map((_, i) => (
              <span
                key={i}
                data-cycle-pip
                data-filled={i < done}
                className={`h-1 w-1 rounded-full ${i < done ? 'bg-[var(--accent)]' : 'bg-neutral-600'}`}
              />
            ))}
            <span className="ml-0.5 text-[8px] font-semibold tabular-nums text-neutral-400">
              {current}/{N}
            </span>
          </span>
        </div>
        {taskTitle && <div className="max-w-[130px] truncate text-[9px] leading-tight text-neutral-400">{taskTitle}</div>}
        <div className="text-[30px] font-semibold leading-9 tabular-nums tracking-tight text-white">
          {formatTime(secondsLeft)}
        </div>
      </div>

      <div className="h-10 w-px bg-white/10" />

      <button
        onClick={toggle}
        title={running ? 'Pause' : 'Resume'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/50 text-[var(--accent)] transition-colors hover:bg-white/5"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
      </button>
    </div>
  )
}
