import FlipDigit from './FlipDigit'

function Colon({ height }) {
  const d = Math.max(4, Math.round(height * 0.085))
  return (
    <div className="flex flex-col items-center justify-center" style={{ height, gap: d * 1.6, padding: '0 1px' }}>
      <span className="rounded-full bg-fg-3" style={{ width: d, height: d }} />
      <span className="rounded-full bg-fg-3" style={{ width: d, height: d }} />
    </div>
  )
}

export const is12h = (format) => {
  if (format === '12') return true
  if (format === '24') return false
  try {
    return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
  } catch {
    return false
  }
}

export default function FlipClock({ now, hour12, height = 64, showAmPm = true }) {
  let h = now.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (hour12) h = h % 12 || 12
  const hh = String(h).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const width = Math.round(height * 0.62)
  const gap = Math.max(3, Math.round(height * 0.05))

  return (
    <div className="relative inline-flex items-start" aria-label={`${hh}:${mm}${hour12 ? ` ${ampm}` : ''}`} role="img">
      <div className="flex items-stretch" style={{ gap }}>
        <FlipDigit value={hh[0]} width={width} height={height} />
        <FlipDigit value={hh[1]} width={width} height={height} />
        <Colon height={height} />
        <FlipDigit value={mm[0]} width={width} height={height} />
        <FlipDigit value={mm[1]} width={width} height={height} />
      </div>
      {hour12 && showAmPm && (
        <span className="absolute left-full top-0.5 ml-1.5 text-[11px] font-semibold text-accent">{ampm}</span>
      )}
    </div>
  )
}
