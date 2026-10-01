import { invoke, setGeneral } from '../lib/ipc'
import { Button, Group, PageHeader, Row, Switch } from '../ui/controls'

const SHORTCUTS = [
  ['Alt + Shift + O', 'Mostrar u ocultar todos los widgets'],
  ['Alt + Shift + M', 'Abrir este panel'],
  ['Alt + Shift + T', 'Activar o desactivar click-through'],
  ['Alt + Shift + P', 'Iniciar o pausar el Pomodoro']
]

export default function StartupPage({ config }) {
  const g = config.general
  const os = window.api.platform === 'darwin' ? 'macOS' : window.api.platform === 'win32' ? 'Windows' : 'el sistema'
  return (
    <>
      <PageHeader title="Inicio y atajos" />
      <Group>
        <Row label={`Abrir al iniciar ${os}`}>
          <Switch label={`Abrir al iniciar ${os}`} checked={g.launchAtLogin} onChange={(v) => setGeneral({ launchAtLogin: v })} />
        </Row>
        <Row label="Click-through" hint="Los clics atraviesan los widgets. Para volver a usarlos, desactívalo aquí, en la bandeja o con Alt + Shift + T.">
          <Switch label="Click-through" checked={g.clickThrough} onChange={(v) => setGeneral({ clickThrough: v })} />
        </Row>
      </Group>

      <Group title="Atajos de teclado" footer="Funcionan desde cualquier aplicación.">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
            <span>{what}</span>
            <kbd className="rounded-md bg-control px-2 py-0.5 font-sans text-[12px] text-fg-2">{keys}</kbd>
          </div>
        ))}
      </Group>

      <Group>
        <Row label="Salir de la app" hint="Cierra todos los widgets y detiene el Pomodoro.">
          <Button onClick={() => invoke('app:quit')}>Salir</Button>
        </Row>
      </Group>
    </>
  )
}
