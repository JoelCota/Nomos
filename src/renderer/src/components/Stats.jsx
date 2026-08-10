import { useMemo } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts'
import { countByDay, currentStreak, lastNDays } from '../lib/stats'
import { formatMinutes } from '../lib/format'

export default function StatsView({ history, onClear }) {
  const todayCount = useMemo(
    () =>
      history.filter(
        (h) => h.mode === 'work' && new Date(h.completedAt).toDateString() === new Date().toDateString()
      ).length,
    [history]
  )
  const todayMinutes = useMemo(
    () => history.filter((h) => h.mode === 'work').reduce((a, h) => a + h.durationSec, 0) / 60,
    [history]
  )
  const weekData = useMemo(() => countByDay(history, lastNDays(7)), [history])
  const streak = useMemo(() => currentStreak(history), [history])
  const tickColor = 'var(--tick-color, #737373)'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">{todayCount}</div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Today</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">
            {formatMinutes(todayMinutes)}
          </div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Focus time</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">{streak}</div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Day streak</div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900/60">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Last 7 days
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={weekData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
            <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {history.length > 0 && (
        <button
          onClick={() => {
            if (confirm('Clear all session history?')) onClear()
          }}
          className="self-end text-[11px] text-neutral-500 underline-offset-2 hover:text-red-500 hover:underline dark:text-neutral-500 dark:hover:text-red-400"
        >
          Clear history
        </button>
      )}
    </div>
  )
}
