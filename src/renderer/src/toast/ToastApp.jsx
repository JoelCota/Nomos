import { useEffect, useState } from 'react'
import useConfig from '../hooks/useConfig'
import { invoke, on } from '../lib/ipc'
import { playSoftChime } from '../lib/sound'

// A notification card, styled like the widgets. It slides in from the right,
// pauses its countdown while hovered, and slides out when it closes.
export default function ToastApp() {
  const config = useConfig()
  const [toast, setToast] = useState(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    invoke('toast:get').then((t) => {
      setToast(t)
      if (t?.sound) playSoftChime()
    })
    return on('toast:closing', () => setLeaving(true))
  }, [])

  if (!config || !toast) return null
  const actions = toast.actions ?? []

  return (
    <div className="h-screen w-screen p-3" onMouseEnter={() => invoke('toast:hover', true)} onMouseLeave={() => invoke('toast:hover', false)}>
      <div
        data-testid="toast"
        role="alert"
        className="widget-card group relative flex h-full w-full gap-3 overflow-hidden rounded-[20px] px-3.5 py-3 text-fg"
        style={{ animation: leaving ? 'toastOut 200ms ease-in forwards' : 'toastIn 280ms cubic-bezier(.2,.8,.2,1)' }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--track)] text-[21px]" aria-hidden>
          {toast.icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between pr-5 text-[11px] text-fg-3">
            <span>{toast.appName}</span>
            <span className="tnum">{toast.time}</span>
          </div>
          <p className="truncate text-[14px] font-semibold leading-snug">{toast.title}</p>
          {toast.body && <p className="line-clamp-2 text-[12px] leading-snug text-fg-2">{toast.body}</p>}
          {actions.length > 0 && (
            <div className="mt-auto flex gap-2 pt-2">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-testid={`toast-action-${a.id}`}
                  onClick={() => invoke('toast:action', a.id)}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                    a.primary ? 'bg-accent text-white hover:brightness-110' : 'bg-[var(--track)] text-fg hover:brightness-95 dark:hover:brightness-125'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => invoke('toast:dismiss')}
          className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--track)] text-fg-3 opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
