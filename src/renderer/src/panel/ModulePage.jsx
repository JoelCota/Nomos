import { getManifest } from '../../../modules/manifests'
import { RENDERERS } from '../../../modules/registry.renderer'
import { SIZE_LABELS, LAYER_LABELS } from '../../../shared/config'
import { setModule, setWidget } from '../lib/ipc'
import { Button, Group, PageHeader, Row, Segmented, Select, Switch } from '../ui/controls'

const CORNERS = [
  { value: '', label: 'Ninguna' },
  { value: 'top-left', label: 'Arriba a la izquierda' },
  { value: 'top-right', label: 'Arriba a la derecha' },
  { value: 'bottom-left', label: 'Abajo a la izquierda' },
  { value: 'bottom-right', label: 'Abajo a la derecha' }
]

function WidgetSettings({ id, manifest, widget }) {
  const set = (patch) => setWidget(id, patch)
  return (
    <Group title="Widget" footer="También puedes cambiar estas opciones con clic derecho sobre el widget.">
      <Row label="Mostrar en el escritorio">
        <Switch label="Mostrar en el escritorio" checked={widget.visible} onChange={(v) => set({ visible: v })} />
      </Row>
      <Row label="Tamaño">
        <Segmented
          label="Tamaño"
          value={widget.size}
          onChange={(v) => set({ size: v })}
          options={manifest.sizes.map((s) => ({ value: s, label: SIZE_LABELS[s] }))}
        />
      </Row>
      <Row
        label="Capa"
        hint={
          widget.layer === 'bottom'
            ? 'Por ahora «Al fondo» deja el widget como una ventana normal que otras ventanas pueden tapar.'
            : undefined
        }
      >
        <Segmented
          label="Capa"
          value={widget.layer}
          onChange={(v) => set({ layer: v })}
          options={Object.entries(LAYER_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Row>
      <Row label="Anclar a una esquina" htmlFor={`${id}-corner`}>
        <Select
          id={`${id}-corner`}
          label="Anclar a una esquina"
          value={widget.snapCorner ?? ''}
          onChange={(v) => set({ snapCorner: v || null })}
          options={CORNERS}
        />
      </Row>
      <Row label="Opacidad" htmlFor={`${id}-opacity`}>
        <input
          id={`${id}-opacity`}
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={widget.opacity}
          onChange={(e) => set({ opacity: parseFloat(e.target.value) })}
          className="w-36 accent-accent"
        />
        <span className="tnum w-10 text-right text-[12px] text-fg-3">{Math.round(widget.opacity * 100)}%</span>
      </Row>
    </Group>
  )
}

export default function ModulePage({ id, config }) {
  const manifest = getManifest(id)
  const mod = config.modules[id]
  const { Panel } = RENDERERS[id] ?? {}

  return (
    <>
      <PageHeader icon={manifest.icon} title={manifest.name} description={manifest.description}>
        <Switch label={`Activar ${manifest.name}`} checked={mod.enabled} onChange={(v) => setModule(id, { enabled: v })} />
      </PageHeader>
      {mod.enabled ? (
        <>
          {Panel && <Panel settings={mod.settings} config={config} />}
          <WidgetSettings id={id} manifest={manifest} widget={mod.widget} />
        </>
      ) : (
        <div className="rounded-xl bg-group px-6 py-10 text-center">
          <p className="text-[13px] text-fg-2">El módulo {manifest.name} está desactivado. Actívalo para ver su widget y sus ajustes.</p>
          <Button variant="primary" className="mt-4" onClick={() => setModule(id, { enabled: true })}>
            Activar {manifest.name}
          </Button>
        </div>
      )}
    </>
  )
}
