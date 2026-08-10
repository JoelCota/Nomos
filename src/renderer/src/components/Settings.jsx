const ACCENTS = ['#f97316', '#ef4444', '#e11d48', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#eab308']

function Toggle({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-300">{label}</span>
      <span
        className={`relative w-8 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-neutral-300 dark:bg-neutral-700'
        }`}
        style={{ height: 18 }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? 16 : 2 }}
        />
      </span>
    </button>
  )
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === o.value
              ? 'bg-[var(--accent)] text-white'
              : 'bg-neutral-200 text-neutral-500 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

export default function SettingsView({ settings, onChange }) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto pr-0.5">
      <Section title="Behavior">
        <Toggle checked={settings.autoStartNext ?? true} onChange={(v) => onChange({ autoStartNext: v })} label="Auto-start breaks" />
        <Toggle checked={settings.flipClock ?? true} onChange={(v) => onChange({ flipClock: v })} label="Show flip clock" />
        <Toggle checked={settings.soundEnabled ?? true} onChange={(v) => onChange({ soundEnabled: v })} label="End-of-session sound" />
        <Toggle checked={settings.notificationsEnabled ?? true} onChange={(v) => onChange({ notificationsEnabled: v })} label="Desktop notifications" />
        <Toggle checked={settings.alwaysOnTop ?? true} onChange={(v) => onChange({ alwaysOnTop: v })} label="Always on top" />
        <Toggle checked={settings.launchAtLogin ?? false} onChange={(v) => onChange({ launchAtLogin: v })} label="Launch at login" />
        <Toggle checked={settings.clickThrough ?? false} onChange={(v) => onChange({ clickThrough: v })} label="Click-through (Alt+Shift+T)" />
      </Section>

      <Section title="Appearance">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Theme</span>
          <Segmented
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' }
            ]}
            value={settings.theme ?? 'dark'}
            onChange={(v) => onChange({ theme: v })}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Clock format</span>
          <Segmented
            options={[
              { value: 'auto', label: 'Auto' },
              { value: '12', label: '12h' },
              { value: '24', label: '24h' }
            ]}
            value={settings.clockFormat ?? 'auto'}
            onChange={(v) => onChange({ clockFormat: v })}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Size</span>
          <Segmented
            options={[
              { value: 'small', label: 'S' },
              { value: 'medium', label: 'M' },
              { value: 'large', label: 'L' }
            ]}
            value={settings.widgetSize ?? 'medium'}
            onChange={(v) => onChange({ widgetSize: v })}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Accent</span>
          <div className="flex gap-1">
            {ACCENTS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ accent: c })}
                className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: settings.accent === c ? `2px solid var(--outline-color)` : 'none',
                  outlineOffset: 1
                }}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Opacity</span>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={settings.opacity ?? 1}
            onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
            className="w-28 accent-[var(--accent)]"
          />
        </label>
      </Section>

      <Section title="Window">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Snap to corner</span>
          <select
            value={settings.snapCorner ?? ''}
            onChange={(e) => onChange({ snapCorner: e.target.value || null })}
            className="rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs text-neutral-800 outline-none focus:border-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <option value="">Off</option>
            <option value="top-left">Top-left</option>
            <option value="top-right">Top-right</option>
            <option value="bottom-left">Bottom-left</option>
            <option value="bottom-right">Bottom-right</option>
          </select>
        </div>
      </Section>
    </div>
  )
}
