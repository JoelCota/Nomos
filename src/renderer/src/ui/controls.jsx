// Shared controls for the Control Panel, in the style of macOS System Settings.

export function Switch({ checked, onChange, label, testId, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-accent' : 'bg-control'
      }`}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left]"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  )
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-control p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === o.value ? 'bg-group text-fg shadow-sm' : 'text-fg-2 hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// A titled, rounded list of rows.
export function Group({ title, footer, children }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-1.5 px-1 text-[12px] font-semibold text-fg-3">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-group">{children}</div>
      {footer && <p className="mt-1.5 px-1 text-[12px] leading-snug text-fg-3">{footer}</p>}
    </section>
  )
}

export function Row({ label, hint, children, htmlFor }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] text-fg">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 60, step = 1, suffix = '', label }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)))
  return (
    <div className="inline-flex items-center rounded-lg bg-control" aria-label={label}>
      <button
        type="button"
        aria-label={`Menos ${label ?? ''}`}
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="h-7 w-7 rounded-l-lg text-fg-2 hover:text-fg disabled:opacity-30"
      >
        −
      </button>
      <span className="tnum min-w-[64px] text-center text-[13px] font-medium">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label={`Más ${label ?? ''}`}
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="h-7 w-7 rounded-r-lg text-fg-2 hover:text-fg disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}

export function Select({ value, onChange, options, id, label }) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[220px] rounded-lg border-0 bg-control px-2.5 py-1.5 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Button({ children, onClick, variant = 'secondary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-accent text-white hover:brightness-110',
    secondary: 'bg-control text-fg hover:brightness-95 dark:hover:brightness-125',
    plain: 'text-accent hover:bg-accent/10'
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function PageHeader({ icon, title, description, children }) {
  return (
    <header className="mb-6 flex items-start gap-3">
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-group text-[22px]" aria-hidden>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] font-semibold leading-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
      </div>
      {children}
    </header>
  )
}
