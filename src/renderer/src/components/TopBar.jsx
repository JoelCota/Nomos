const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'timer', label: 'Timer' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' }
]

export default function TopBar({ tab, onTabChange, visible, onCollapse }) {
  return (
    <header
      data-testid="topbar"
      className={`flex items-center gap-1 overflow-hidden px-1.5 pb-0.5 pt-1 transition-all duration-300 ${
        visible ? 'visible max-h-10 translate-y-0' : 'invisible max-h-0 -translate-y-1 pointer-events-none focus-hidden'
      }`}
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex min-w-0 flex-1 justify-start gap-0.5 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => onTabChange(t.id)}
            className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
              tab === t.id
                ? 'text-[var(--accent)]'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {tab === 'home' && (
          <button
            data-testid="collapse-btn"
            onClick={onCollapse}
            title="Collapse to clock"
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg width="9" height="9" viewBox="0 0 10 10">
              <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button
          data-testid="hide-btn"
          onClick={() => window.api.win.hide()}
          title="Hide to tray"
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button
          data-testid="quit-btn"
          onClick={() => window.api.app.quit()}
          title="Quit"
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-red-500/20 hover:text-red-500 dark:text-neutral-400 dark:hover:bg-red-500/20 dark:hover:text-red-400"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
    </header>
  )
}
