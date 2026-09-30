import { MANIFESTS } from '../../../modules/manifests'
import { setModule, setWidget } from '../lib/ipc'
import { Button, Group, PageHeader, Switch } from '../ui/controls'

export default function ModulesPage({ config, onOpen }) {
  return (
    <>
      <PageHeader title="Módulos" description="Activa los módulos que quieras usar. Cada uno tiene su propio widget en el escritorio." />
      <Group footer="Ocultar un widget no apaga su módulo: el Pomodoro sigue contando aunque no lo veas. Desactivar un módulo lo apaga del todo, pero conserva sus datos.">
        {MANIFESTS.map((m) => {
          const mod = config.modules[m.id]
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--track)] text-[20px]" aria-hidden>
                {m.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{m.name}</p>
                <p className="text-[12px] text-fg-3">
                  {mod.enabled ? (mod.widget.visible ? 'Widget visible' : 'Widget oculto') : m.description}
                </p>
              </div>
              {mod.enabled && (
                <Button variant="plain" onClick={() => setWidget(m.id, { visible: !mod.widget.visible })}>
                  {mod.widget.visible ? 'Ocultar' : 'Mostrar'}
                </Button>
              )}
              <Button variant="plain" onClick={() => onOpen(m.id)}>
                Ajustes
              </Button>
              <Switch
                label={`Activar ${m.name}`}
                testId={`module-toggle-${m.id}`}
                checked={mod.enabled}
                onChange={(v) => setModule(m.id, { enabled: v })}
              />
            </div>
          )
        })}
      </Group>
    </>
  )
}
