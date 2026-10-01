// iOS-style building blocks for the phone app.
import { useEffect } from 'react'
import plantUrl from './plant.svg'

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const deviceName = () => {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  return 'Navegador'
}

export const haptic = () => {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* not supported */
  }
}

export function Logo({ size = 28, className = '' }) {
  const mask = `url(${plantUrl}) center / contain no-repeat`
  return <span aria-hidden className={`inline-block shrink-0 bg-current ${className}`} style={{ width: size, height: size, mask, WebkitMask: mask }} />
}

export function Header({ title, subtitle, right }) {
  return (
    <header className="pt-safe px-5 pb-2">
      <div className="flex min-h-[28px] items-center justify-end">{right}</div>
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="text-[15px] text-fg-3">{subtitle}</p>}
    </header>
  )
}

export function Group({ title, footer, children, className = '' }) {
  return (
    <section className={`mx-4 mb-7 ${className}`}>
      {title && <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-wide text-fg-3">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-fg-3">{footer}</p>}
    </section>
  )
}

export function Row({ children, onClick, className = '', ...rest }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left text-[17px] ${onClick ? 'press' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function Ring({ value, size = 34, stroke = 3.5, color = 'var(--accent)', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .35s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  )
}

export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-[9px] bg-fill p-[2px] ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[7px] px-2 py-1.5 text-[13px] font-medium transition ${
            value === o.value ? 'bg-card text-fg shadow-[0_1px_3px_rgba(0,0,0,0.15)]' : 'text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-accent text-white',
    secondary: 'bg-fill text-accent',
    danger: 'bg-fill text-bad',
    plain: 'text-accent'
  }
  return (
    <button
      type="button"
      className={`press rounded-[12px] px-4 py-3 text-[17px] font-semibold disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// Action sheet that slides up from the bottom.
export function Sheet({ title, subtitle, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Cerrar" className="backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet pb-safe relative mx-2 mb-2">
        <div className="overflow-hidden rounded-[14px] bg-card">
          {(title || subtitle) && (
            <div className="px-4 py-3 text-center">
              {title && <p className="text-[13px] font-semibold text-fg-3">{title}</p>}
              {subtitle && <p className="text-[13px] text-fg-3">{subtitle}</p>}
            </div>
          )}
          <div className="divide-y divide-line border-t border-line">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  onClose()
                  a.onClick()
                }}
                className={`press block w-full py-[14px] text-center text-[20px] ${a.danger ? 'text-bad' : 'text-accent'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} className="press mt-2 block w-full rounded-[14px] bg-card py-[14px] text-[20px] font-semibold text-accent">
          Cancelar
        </button>
      </div>
    </div>
  )
}

const ICONS = {
  today: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 12.3l2.6 2.6 5-5.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  tasks: (
    <path d="M9 6.5h11M9 12h11M9 17.5h11M4.2 6.5h.1M4.2 12h.1M4.2 17.5h.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  )
}

export function TabBar({ tabs, value, onChange }) {
  return (
    <nav
      aria-label="Secciones"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--card)_86%,transparent)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[560px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={value === t.id ? 'page' : undefined}
            onClick={() => onChange(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2 text-[10px] font-medium ${value === t.id ? 'text-accent' : 'text-fg-3'}`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
              {ICONS[t.id]}
            </svg>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function Banner({ children, tone = 'muted' }) {
  return (
    <p
      role="status"
      className={`mx-4 mb-4 rounded-[12px] px-4 py-2.5 text-[14px] ${tone === 'bad' ? 'bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-bad' : 'bg-fill text-fg-2'}`}
    >
      {children}
    </p>
  )
}
