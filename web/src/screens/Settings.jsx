import { useEffect, useState } from 'react'
import { api, syncNow, unlink, useStore } from '../store'
import { disablePush, enablePush, pushStatus } from '../push'
import { Group, Header, Row, Segmented, Sheet } from '../ui'

const NOTIFY = [
  { value: 'always', label: 'Siempre' },
  { value: 'away', label: 'PC apagada' },
  { value: 'never', label: 'Nunca' }
]

function ago(ms, now) {
  if (!ms) return 'nunca'
  const s = Math.round((now - ms) / 1000)
  if (s < 30) return 'hace un momento'
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`
  return `hace ${Math.round(s / 3600)} h`
}

export default function Settings() {
  const st = useStore()
  const [push, setPush] = useState(null)
  const [device, setDevice] = useState(st.device)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    pushStatus().then(setPush)
    api('GET', '/api/device')
      .then((r) => setDevice(r.device))
      .catch(() => {})
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const run = async (fn, ok) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg({ text: ok })
    } catch (err) {
      setMsg({ text: err.message, bad: true })
    } finally {
      setBusy(false)
      setPush(await pushStatus())
    }
  }

  const setNotify = (notify) =>
    run(async () => {
      const r = await api('PATCH', '/api/device', { notify })
      setDevice(r.device)
    })

  return (
    <>
      <Header title="Ajustes" />

      <Group
        title="Recordatorios"
        footer={
          push === 'install'
            ? 'En iPhone, las notificaciones solo funcionan con Nomos agregado a la pantalla de inicio (Compartir → Agregar a pantalla de inicio).'
            : 'Te avisan de tus hábitos a sus horas y con el resumen de la noche, aunque la PC esté apagada. Las horas se configuran en Nomos en tu PC.'
        }
      >
        <Row>
          <span className="flex-1">Notificaciones</span>
          {push === 'on' && <span className="text-[15px] text-good">Activadas</span>}
          {push === 'denied' && <span className="text-[15px] text-fg-3">Bloqueadas</span>}
          {push === 'unsupported' && <span className="text-[15px] text-fg-3">No disponibles</span>}
          {push === 'install' && <span className="text-[15px] text-fg-3">Instala la app</span>}
          {push === 'off' && (
            <button
              type="button"
              data-testid="push-enable"
              disabled={busy}
              onClick={() => run(enablePush, 'Listo: te llegarán los recordatorios.')}
              className="press text-[17px] text-accent"
            >
              Activar
            </button>
          )}
        </Row>
        {push === 'on' && (
          <>
            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">Avisarme</p>
              <Segmented label="Avisarme" value={device?.notify ?? 'always'} onChange={setNotify} options={NOTIFY} />
              <p className="mt-2 text-[13px] text-fg-3">
                {device?.notify === 'away'
                  ? 'Solo cuando Nomos en tu PC lleva unos minutos sin conectarse. Si estás en la PC, te avisa ahí.'
                  : device?.notify === 'never'
                    ? 'Este celular no recibirá recordatorios.'
                    : 'En el celular siempre, también si estás en la PC.'}
              </p>
            </div>
            <Row onClick={() => run(() => api('POST', '/api/push/test'), 'Notificación de prueba enviada.')}>
              <span className="flex-1 text-accent">Enviar una de prueba</span>
            </Row>
            <Row onClick={() => run(disablePush, 'Notificaciones desactivadas en este celular.')}>
              <span className="flex-1 text-bad">Desactivar notificaciones</span>
            </Row>
          </>
        )}
      </Group>
      {msg && (
        <p role="status" className={`-mt-5 mb-6 px-8 text-[14px] ${msg.bad ? 'text-bad' : 'text-fg-3'}`}>
          {msg.text}
        </p>
      )}

      <Group title="Sincronización">
        <Row>
          <span className="flex-1">Última actualización</span>
          <span className="text-[15px] text-fg-3">{st.syncing ? 'Actualizando…' : ago(st.lastSync, now)}</span>
        </Row>
        {st.outbox.length > 0 && (
          <Row>
            <span className="flex-1">Cambios por enviar</span>
            <span className="text-[15px] text-fg-3">{st.outbox.length}</span>
          </Row>
        )}
        <Row onClick={() => syncNow()}>
          <span className="flex-1 text-accent">Actualizar ahora</span>
        </Row>
      </Group>

      <Group title="Este dispositivo" footer="Desvincularlo borra la llave de este celular. Tus datos siguen en tu PC y en tu servidor.">
        <Row>
          <span className="flex-1">Nombre</span>
          <span className="text-[15px] text-fg-3">{device?.name ?? '—'}</span>
        </Row>
        <Row>
          <span className="flex-1">Servidor</span>
          <span className="max-w-[60%] truncate text-[15px] text-fg-3">{location.host}</span>
        </Row>
        <Row onClick={() => setConfirm(true)}>
          <span className="flex-1 text-bad">Desvincular este celular</span>
        </Row>
      </Group>

      <p className="mb-8 text-center text-[13px] text-fg-3">Nomos · tus hábitos, a tu manera</p>

      {confirm && (
        <Sheet
          title="¿Desvincular este celular?"
          subtitle="Tendrás que pedir un código nuevo en tu PC para volver a conectarlo."
          actions={[{ label: 'Desvincular', danger: true, onClick: () => run(async () => (await disablePush().catch(() => {}), await unlink())) }]}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  )
}

