import { useEffect, useState } from 'react'
import useNow from '../../../renderer/src/hooks/useNow'
import { LOCALE } from '../../../shared/time'
import { formatHM, isDaytime, isValidTimeZone, localParts, relativeText, zonedParts } from '../zones'
import AnalogClock from './AnalogClock'
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

// Dial colour of the main clock follows the app theme.
function useDarkTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

function WorldClocks({ now, clocks, analog, hour12 }) {
  const valid = clocks.filter((c) => isValidTimeZone(c.tz))
  if (analog) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {valid.map((c) => {
          const p = zonedParts(now, c.tz)
          return (
            <div key={c.tz} data-testid="world-clock" className="flex min-w-0 flex-col items-center text-center">
              <AnalogClock parts={p} size={64} showSeconds={false} face={isDaytime(p) ? 'light' : 'dark'} />
              <p className="mt-1.5 w-full truncate text-[12px] font-semibold leading-tight">{c.city}</p>
              <p className="w-full truncate text-[11px] leading-tight text-fg-3">{relativeText(now, c.tz)}</p>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {valid.map((c) => {
        const p = zonedParts(now, c.tz)
        return (
          <div key={c.tz} data-testid="world-clock" className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{c.city}</p>
              <p className="truncate text-[11px] leading-tight text-fg-3">{relativeText(now, c.tz)}</p>
            </div>
            <span className="tnum text-[22px] font-semibold tracking-tight">{formatHM(p, hour12)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ClockWidget({ size, settings }) {
  const now = useNow()
  const dark = useDarkTheme()
  const hour12 = is12h(settings.clockFormat)
  const analog = settings.style === 'analog'
  const showSeconds = settings.showSeconds !== false
  const face = dark ? 'dark' : 'light'
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'
  const parts = localParts(now)
  const weekday = cap(now.toLocaleDateString(LOCALE, { weekday: 'long' }))
  const date = now.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })
  const worldClocks = (settings.worldClocks ?? []).slice(0, 3)

  if (size === 'small') {
    const short = cap(now.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }).replace(',', ''))
    return (
      <div data-testid="clock-widget" className="flex h-full flex-col items-center justify-center gap-2.5">
        {analog ? (
          <AnalogClock testId="analog-clock" parts={parts} size={104} showSeconds={showSeconds} face={face} />
        ) : (
          <FlipClock now={now} hour12={hour12} height={44} showAmPm={false} />
        )}
        <p className="text-[13px] font-medium text-fg-2">
          {short}
          {hour12 && !analog && <span className="ml-1.5 text-accent">{ampm}</span>}
        </p>
      </div>
    )
  }

  if (size === 'large') {
    if (worldClocks.length) {
      return (
        <div data-testid="clock-widget" className="flex h-full flex-col px-5 py-4">
          <div className="flex items-center gap-4">
            {analog ? (
              <AnalogClock testId="analog-clock" parts={parts} size={124} showSeconds={showSeconds} face={face} />
            ) : (
              <FlipClock now={now} hour12={hour12} height={52} showAmPm={false} />
            )}
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-tight">{weekday}</p>
              <p className="whitespace-nowrap text-[13px] text-fg-2">{date}</p>
              {hour12 && !analog && <p className="mt-1 text-[12px] font-semibold text-accent">{ampm}</p>}
            </div>
          </div>
          <div className="my-3.5 h-px bg-[var(--line)]" />
          <div className="flex flex-1 flex-col justify-center">
            <WorldClocks now={now} clocks={worldClocks} analog={analog} hour12={hour12} />
          </div>
        </div>
      )
    }
    return (
      <div data-testid="clock-widget" className="flex h-full flex-col items-center justify-center gap-5 px-5">
        {analog ? (
          <AnalogClock testId="analog-clock" parts={parts} size={196} showSeconds={showSeconds} face={face} />
        ) : (
          <FlipClock now={now} hour12={hour12} height={92} />
        )}
        <div className="text-center">
          <p className="text-[20px] font-semibold leading-tight">{weekday}</p>
          <p className="mt-0.5 text-[14px] text-fg-2">{now.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          {!analog && <p className="mt-2 text-[12px] text-fg-3">Semana {isoWeek(now)}</p>}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="clock-widget" className="flex h-full items-center justify-center gap-5 px-5">
      {analog ? (
        <AnalogClock testId="analog-clock" parts={parts} size={124} showSeconds={showSeconds} face={face} />
      ) : (
        <FlipClock now={now} hour12={hour12} height={58} showAmPm={false} />
      )}
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight">{weekday}</p>
        <p className="whitespace-nowrap text-[13px] text-fg-2">{date}</p>
        {hour12 && !analog && <p className="mt-1 text-[12px] font-semibold text-accent">{ampm}</p>}
        {analog && <p className="mt-1 text-[12px] text-fg-3">Semana {isoWeek(now)}</p>}
      </div>
    </div>
  )
}
