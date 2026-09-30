import useNow from '../../../renderer/src/hooks/useNow'
import { LOCALE } from '../../../shared/time'
import FlipClock, { is12h } from './FlipClock'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// ISO-8601 week number.
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7)
}

export default function ClockWidget({ size, settings }) {
  const now = useNow()
  const hour12 = is12h(settings.clockFormat)
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'

  if (size === 'small') {
    const short = cap(now.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }).replace(',', ''))
    return (
      <div data-testid="clock-widget" className="flex h-full flex-col items-center justify-center gap-3">
        <FlipClock now={now} hour12={hour12} height={44} showAmPm={false} />
        <p className="text-[13px] font-medium text-fg-2">
          {short}
          {hour12 && <span className="ml-1.5 text-accent">{ampm}</span>}
        </p>
      </div>
    )
  }

  const weekday = cap(now.toLocaleDateString(LOCALE, { weekday: 'long' }))
  const date = now.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })

  if (size === 'large') {
    return (
      <div data-testid="clock-widget" className="flex h-full flex-col items-center justify-center gap-6 px-5">
        <FlipClock now={now} hour12={hour12} height={92} />
        <div className="text-center">
          <p className="text-[22px] font-semibold leading-tight">{weekday}</p>
          <p className="mt-0.5 text-[15px] text-fg-2">{now.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="mt-3 text-[12px] text-fg-3">Semana {isoWeek(now)}</p>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="clock-widget" className="flex h-full items-center justify-center gap-5 px-5">
      <FlipClock now={now} hour12={hour12} height={58} showAmPm={false} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight">{weekday}</p>
        <p className="whitespace-nowrap text-[13px] text-fg-2">{date}</p>
        {hour12 && <p className="mt-1 text-[12px] font-semibold text-accent">{ampm}</p>}
      </div>
    </div>
  )
}
