import { useEffect, useState } from 'react'
import { invoke, on } from '../lib/ipc'
import { Button, Group, PageHeader, Row } from '../ui/controls'

const INPUT =
  'w-72 rounded-lg bg-control px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus-visible:ring-2 focus-visible:ring-accent'

// What each module sends to the server.
const SYNCED = [
  { id: 'habits', label: 'Hábitos y su registro diario' },
  { id: 'pomodoro', label: 'Tareas e historial del Pomodoro' }
]

function ago(iso, now) {
  if (!iso) return 'todavía no'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'hace un momento'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function StateLine({ status, now }) {
  const map = {
    syncing: ['bg-accent animate-pulse', 'Sincronizando…'],
    ok: ['bg-break', `Al día · ${ago(status.lastSyncAt, now)}`],
    idle: ['bg-fg-3', 'Conectado'],
    offline: ['bg-[#eab308]', 'Sin conexión. Lo vuelve a intentar solo.'],
    error: ['bg-[#ef4444]', status.error ?? 'Error']
  }
  const [dot, text] = map[status.state] ?? map.idle
  return (
    <span data-testid="sync-state" data-state={status.state} className="flex items-center gap-2 text-[13px] text-fg-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  )
}

export default function SyncPage({ config }) {
  const [status, setStatus] = useState(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    invoke('sync:status').then(setStatus)
    const off = on('sync:status', setStatus)
    const t = setInterval(() => setNow(Date.now()), 20000)
    return () => {
      off?.()
      clearInterval(t)
    }
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r?.status) setStatus(r.status)
      if (r && r.ok === false) setError(r.error)
      return r
    } finally {
      setBusy(false)
      setNow(Date.now())
    }
  }

  const connect = async (e) => {
    e.preventDefault()
    const r = await run(() => invoke('sync:connect', url, token))
    if (r?.ok) setToken('')
  }

  if (!status) return <PageHeader title="Sincronización" />

  return (
    <>
      <PageHeader
        title="Sincronización"
        description="Guarda tus datos en tu propio servidor de Nomos para usarlos desde el celular u otra computadora. Sin internet, Nomos sigue funcionando y sincroniza al volver."
      />

      {!status.connected ? (
        <form onSubmit={connect}>
          <Group title="Tu servidor" footer="La dirección y el token te los da la guía de instalación del servidor (carpeta server/ del proyecto). El token se guarda cifrado en este equipo.">
            <Row label="Dirección" htmlFor="sync-url">
              <input
                id="sync-url"
                data-testid="sync-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://nomos-api.tu-cuenta.workers.dev"
                autoComplete="off"
                spellCheck={false}
                className={INPUT}
              />
            </Row>
            <Row label="Token" htmlFor="sync-token">
              <input
                id="sync-token"
                data-testid="sync-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="El token de tu servidor"
                autoComplete="off"
                className={INPUT}
              />
            </Row>
          </Group>
          {error && (
            <p role="alert" data-testid="sync-error" className="-mt-3 mb-4 px-1 text-[12px] text-[#ef4444]">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" data-testid="sync-connect" disabled={busy || !url.trim() || !token.trim()}>
            {busy ? 'Conectando…' : 'Conectar'}
          </Button>
        </form>
      ) : (
        <>
          <Group footer="Los cambios se envían en cuanto los haces y se revisan los de otros dispositivos cada 30 segundos.">
            <Row label="Servidor">
              <span className="max-w-[320px] truncate text-[13px] text-fg-2" title={status.url}>
                {status.url.replace(/^https?:\/\//, '')}
              </span>
            </Row>
            <Row label="Estado">
              <StateLine status={status} now={now} />
            </Row>
          </Group>

          <Group title="Qué se sincroniza" footer="Solo los módulos activados. Los ajustes y el aspecto de los widgets se quedan en cada equipo.">
            {SYNCED.map((s) => {
              const on = config.modules[s.id]?.enabled
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className={on ? '' : 'text-fg-3'}>{s.label}</span>
                  <span className="text-[12px] text-fg-3">{on ? 'Sí' : 'Módulo apagado'}</span>
                </div>
              )
            })}
          </Group>

          {error && (
            <p role="alert" className="-mt-3 mb-4 px-1 text-[12px] text-[#ef4444]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" data-testid="sync-now" disabled={busy || status.state === 'syncing'} onClick={() => run(() => invoke('sync:now'))}>
              Sincronizar ahora
            </Button>
            <Button data-testid="sync-disconnect" disabled={busy} onClick={() => run(async () => ({ status: await invoke('sync:disconnect') }))}>
              Desconectar
            </Button>
          </div>
          <p className="mt-3 px-1 text-[12px] text-fg-3">Desconectar no borra nada, ni en este equipo ni en el servidor.</p>
        </>
      )}
    </>
  )
}
