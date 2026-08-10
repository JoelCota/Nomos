import { useState } from 'react'

const FOCUS_MIN = 25

export default function TimerPanel({ timer, settings, tasks, currentTaskId, onSelectTask, onSettings }) {
  const { running, started, toggle, reset, start } = timer
  const durations = settings.durations ?? {}
  const [breakType, setBreakType] = useState('short')
  const minutes = durations[breakType] ?? (breakType === 'short' ? 5 : 15)
  const cycles = settings.longBreakInterval ?? 4
  const active = started

  const setMinutes = (v) => {
    const clamped = Math.min(60, Math.max(1, v))
    onSettings({ durations: { ...durations, [breakType]: clamped } })
  }
  const setCycles = (v) => {
    const clamped = Math.min(8, Math.max(1, v))
    onSettings({ longBreakInterval: clamped })
  }

  const primaryLabel = !active ? 'Start session' : running ? 'Pause' : 'Resume'
  const primaryAction = () => {
    if (!active) start()
    else toggle()
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Break time
        </label>
        <div className="flex gap-1">
          {[
            { id: 'short', label: 'Short' },
            { id: 'long', label: 'Long' }
          ].map((b) => (
            <button
              key={b.id}
              onClick={() => setBreakType(b.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                breakType === b.id
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border border-neutral-200 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
            <button
              onClick={() => setMinutes(minutes - 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              −
            </button>
            <span className="text-sm font-semibold tabular-nums">{minutes} min</span>
            <button
              onClick={() => setMinutes(minutes + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              +
            </button>
          </div>
          <div className="flex gap-1">
            {[5, 10, 15].map((p) => (
              <button
                key={p}
                onClick={() => setMinutes(p)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  minutes === p
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-neutral-100 text-neutral-500 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
          Short break after each focus (default 5 min) — long break after every {cycles} focuses.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Focus sessions per cycle
        </label>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            onClick={() => setCycles(cycles - 1)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            −
          </button>
          <span className="text-sm font-semibold tabular-nums">{cycles}</span>
          <button
            onClick={() => setCycles(cycles + 1)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            +
          </button>
        </div>
        <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
          Each focus session runs {FOCUS_MIN} minutes — the cycle runs automatically.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Task (optional)
        </label>
        <select
          value={currentTaskId ?? ''}
          onChange={(e) => onSelectTask(e.target.value || null)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id} disabled={t.done}>
              {t.title}
              {t.done ? ' (done)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={primaryAction}
          className="flex-1 rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
        >
          {primaryLabel}
        </button>
        {active && (
          <button
            onClick={reset}
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Reset
          </button>
        )}
      </div>

      {active && (
        <p className="text-center text-[10px] text-neutral-400 dark:text-neutral-500">
          Session is {running ? 'running' : 'paused'} — see it on Home.
        </p>
      )}
    </div>
  )
}
