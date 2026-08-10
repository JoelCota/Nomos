import { useEffect, useMemo, useState } from 'react'
import FlipDigit from './FlipDigit'

function Colon({ height }) {
  const d = Math.max(4, Math.round(height * 0.09))
  return (
    <div
      className="flex flex-col items-center justify-center gap-[0.32em] px-0.5"
      style={{ height }}
    >
      <span className="rounded-full" style={{ width: d, height: d, background: 'rgba(255,255,255,0.45)' }} />
      <span className="rounded-full" style={{ width: d, height: d, background: 'rgba(255,255,255,0.45)' }} />
    </div>
  )
}

export default function FlipClock({ format = 'auto', height = 64, draggable = false }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 500)
    return () => clearInterval(id)
  }, [])

  const hour12 = useMemo(() => {
    if (format === '12') return true
    if (format === '24') return false
    try {
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
    } catch {
      return false
    }
  }, [format])

  let h = now.getHours()
  let ampm = ''
  if (hour12) {
    ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
  }
  const hh = String(h).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const width = Math.round(height * 0.62)

  return (
    <div
      data-testid="clock-area"
      className="relative flex items-start justify-center"
      style={{ WebkitAppRegion: draggable ? 'drag' : 'no-drag' }}
    >
      <div className="flex items-stretch gap-[0.22em]">
        <FlipDigit value={hh[0]} width={width} height={height} />
        <FlipDigit value={hh[1]} width={width} height={height} />
        <Colon height={height} />
        <FlipDigit value={mm[0]} width={width} height={height} />
        <FlipDigit value={mm[1]} width={width} height={height} />
      </div>
      {hour12 && (
        <span
          className="absolute left-full ml-1.5 top-1 text-[11px] font-bold tracking-widest"
          style={{ color: 'var(--accent)' }}
        >
          {ampm}
        </span>
      )}
    </div>
  )
}
