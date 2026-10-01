// The UI is in Spanish, so dates are formatted in Spanish too.
export const LOCALE = 'es-MX'

export const formatTime = (seconds) => {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const formatMinutes = (seconds) => `${Math.round(seconds / 60)} min`

export const dayKey = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const isToday = (iso, now = new Date()) => dayKey(new Date(iso)) === dayKey(now)
