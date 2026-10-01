import { Group, Row, Segmented } from '../../../renderer/src/ui/controls'
import { setModuleSettings } from '../../../renderer/src/lib/ipc'

export default function ClockPanel({ settings }) {
  const set = (patch) => setModuleSettings('clock', patch)
  return (
    <Group title="Reloj">
      <Row label="Formato de hora" hint="«Automático» usa el formato de tu sistema.">
        <Segmented
          label="Formato de hora"
          value={settings.clockFormat}
          onChange={(v) => set({ clockFormat: v })}
          options={[
            { value: 'auto', label: 'Automático' },
            { value: '12', label: '12 h' },
            { value: '24', label: '24 h' }
          ]}
        />
      </Row>
      <Row label="Estilo" hint="El reloj analógico llega en una próxima versión.">
        <Segmented
          label="Estilo"
          value={settings.style}
          onChange={(v) => set({ style: v })}
          options={[
            { value: 'flip', label: 'Flip' },
            { value: 'analog', label: 'Analógico', disabled: true }
          ]}
        />
      </Row>
    </Group>
  )
}
