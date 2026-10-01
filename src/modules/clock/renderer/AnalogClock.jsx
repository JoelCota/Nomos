// Analog dial in the style of the macOS clock widget. `parts` = { h, m, s }.
// `face`: 'light' | 'dark'. Small dials drop the numbers and minute ticks.
export default function AnalogClock({ parts, size = 120, showSeconds = true, face = 'dark', testId }) {
  const { h, m, s } = parts
  const detailed = size >= 96
  const ink = face === 'dark' ? '#f5f5f7' : '#1d1d1f'
  const faint = face === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
  const fill = face === 'dark' ? '#1c1c1e' : '#ffffff'
  const hourAngle = ((h % 12) + m / 60) * 30
  const minuteAngle = (m + s / 60) * 6
  const secondAngle = s * 6

  return (
    <svg
      data-testid={testId}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`}
      className="shrink-0"
    >
      <circle cx="100" cy="100" r="97" fill={fill} stroke={face === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeWidth="2" />
      {detailed &&
        Array.from({ length: 60 }).map((_, i) =>
          i % 5 === 0 ? null : (
            <line key={i} x1="100" y1="10" x2="100" y2="15" stroke={faint} strokeWidth="1.5" transform={`rotate(${i * 6} 100 100)`} />
          )
        )}
      {Array.from({ length: 12 }).map((_, i) =>
        detailed ? (
          <text
            key={i}
            x={100 + 71 * Math.sin((i + 1) * (Math.PI / 6))}
            y={100 - 71 * Math.cos((i + 1) * (Math.PI / 6))}
            fill={ink}
            fontSize="18"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: 'inherit' }}
          >
            {i + 1}
          </text>
        ) : (
          <line key={i} x1="100" y1="14" x2="100" y2={i % 3 === 2 ? 30 : 24} stroke={i % 3 === 2 ? ink : faint} strokeWidth={i % 3 === 2 ? 6 : 4} strokeLinecap="round" transform={`rotate(${(i + 1) * 30} 100 100)`} />
        )
      )}
      {/* hour */}
      <line x1="100" y1="100" x2="100" y2="52" stroke={ink} strokeWidth="9" strokeLinecap="round" transform={`rotate(${hourAngle} 100 100)`} />
      {/* minute */}
      <line x1="100" y1="100" x2="100" y2="26" stroke={ink} strokeWidth="6" strokeLinecap="round" transform={`rotate(${minuteAngle} 100 100)`} />
      {showSeconds && (
        <g transform={`rotate(${secondAngle} 100 100)`}>
          <line x1="100" y1="122" x2="100" y2="20" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      <circle cx="100" cy="100" r="7" fill={showSeconds ? 'var(--accent)' : ink} />
      <circle cx="100" cy="100" r="2.5" fill={fill} />
    </svg>
  )
}
