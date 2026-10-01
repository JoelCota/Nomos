// World-clock helpers (pure, no DOM): the time in another city and how it
// relates to local time ("Mañana, +8 h").

export const MAX_WORLD_CLOCKS = 3

// Curated list shown in the Control Panel (IANA time zones).
export const CITIES = [
  { city: 'Ciudad de México', tz: 'America/Mexico_City' },
  { city: 'Mazatlán', tz: 'America/Mazatlan' },
  { city: 'Tijuana', tz: 'America/Tijuana' },
  { city: 'Cancún', tz: 'America/Cancun' },
  { city: 'Los Ángeles', tz: 'America/Los_Angeles' },
  { city: 'Denver', tz: 'America/Denver' },
  { city: 'Chicago', tz: 'America/Chicago' },
  { city: 'Nueva York', tz: 'America/New_York' },
  { city: 'Toronto', tz: 'America/Toronto' },
  { city: 'Vancouver', tz: 'America/Vancouver' },
  { city: 'Honolulu', tz: 'Pacific/Honolulu' },
  { city: 'La Habana', tz: 'America/Havana' },
  { city: 'Guatemala', tz: 'America/Guatemala' },
  { city: 'San José (Costa Rica)', tz: 'America/Costa_Rica' },
  { city: 'Panamá', tz: 'America/Panama' },
  { city: 'Bogotá', tz: 'America/Bogota' },
  { city: 'Lima', tz: 'America/Lima' },
  { city: 'Caracas', tz: 'America/Caracas' },
  { city: 'Santiago', tz: 'America/Santiago' },
  { city: 'Buenos Aires', tz: 'America/Argentina/Buenos_Aires' },
  { city: 'Montevideo', tz: 'America/Montevideo' },
  { city: 'São Paulo', tz: 'America/Sao_Paulo' },
  { city: 'Londres', tz: 'Europe/London' },
  { city: 'Lisboa', tz: 'Europe/Lisbon' },
  { city: 'Madrid', tz: 'Europe/Madrid' },
  { city: 'París', tz: 'Europe/Paris' },
  { city: 'Berlín', tz: 'Europe/Berlin' },
  { city: 'Roma', tz: 'Europe/Rome' },
  { city: 'Atenas', tz: 'Europe/Athens' },
  { city: 'Estambul', tz: 'Europe/Istanbul' },
  { city: 'Moscú', tz: 'Europe/Moscow' },
  { city: 'El Cairo', tz: 'Africa/Cairo' },
  { city: 'Johannesburgo', tz: 'Africa/Johannesburg' },
  { city: 'Dubái', tz: 'Asia/Dubai' },
  { city: 'Nueva Delhi', tz: 'Asia/Kolkata' },
  { city: 'Bangkok', tz: 'Asia/Bangkok' },
  { city: 'Singapur', tz: 'Asia/Singapore' },
  { city: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { city: 'Shanghái', tz: 'Asia/Shanghai' },
  { city: 'Seúl', tz: 'Asia/Seoul' },
  { city: 'Tokio', tz: 'Asia/Tokyo' },
  { city: 'Sídney', tz: 'Australia/Sydney' },
  { city: 'Auckland', tz: 'Pacific/Auckland' }
]

const formatters = new Map()
const formatterFor = (tz) => {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
    )
  }
  return formatters.get(tz)
}

export const isValidTimeZone = (tz) => {
  try {
    formatterFor(tz)
    return true
  } catch {
    return false
  }
}

// Wall-clock parts of `date` in `tz`: { y, mo, d, h, m, s }.
export function zonedParts(date, tz) {
  const p = Object.fromEntries(formatterFor(tz).formatToParts(date).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, m: +p.minute, s: +p.second }
}

export const localParts = (date) => ({
  y: date.getFullYear(),
  mo: date.getMonth() + 1,
  d: date.getDate(),
  h: date.getHours(),
  m: date.getMinutes(),
  s: date.getSeconds()
})

// Minutes the city is ahead (+) or behind (−) local time, and the day relative to local.
export function relativeTo(date, tz) {
  const z = zonedParts(date, tz)
  const l = localParts(date)
  const asMinutes = (p) => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m) / 60000
  const diff = Math.round(asMinutes(z) - asMinutes(l))
  const dayDiff = Math.round((Date.UTC(z.y, z.mo - 1, z.d) - Date.UTC(l.y, l.mo - 1, l.d)) / 86400000)
  return { diffMinutes: diff, dayDiff, parts: z }
}

export function offsetText(diffMinutes) {
  if (diffMinutes === 0) return 'misma hora'
  const sign = diffMinutes > 0 ? '+' : '−'
  const a = Math.abs(diffMinutes)
  const h = Math.floor(a / 60)
  const m = a % 60
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''} h`
}

export function relativeText(date, tz) {
  const { diffMinutes, dayDiff } = relativeTo(date, tz)
  const day = dayDiff > 0 ? 'Mañana' : dayDiff < 0 ? 'Ayer' : 'Hoy'
  return `${day}, ${offsetText(diffMinutes)}`
}

export const formatHM = (p, hour12) => {
  if (!hour12) return `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`
  const h = p.h % 12 || 12
  return `${h}:${String(p.m).padStart(2, '0')} ${p.h >= 12 ? 'p. m.' : 'a. m.'}`
}

// Daytime (6:00–18:59) gets a light dial, night a dark one, like macOS.
export const isDaytime = (p) => p.h >= 6 && p.h < 19
