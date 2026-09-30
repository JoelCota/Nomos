import { setGeneral } from '../lib/ipc'
import { Group, PageHeader, Row, Segmented } from '../ui/controls'

const ACCENTS = [
  { hex: '#f97316', name: 'Naranja' },
  { hex: '#ef4444', name: 'Rojo' },
  { hex: '#e11d48', name: 'Frambuesa' },
  { hex: '#eab308', name: 'Amarillo' },
  { hex: '#22c55e', name: 'Verde' },
  { hex: '#0ea5e9', name: 'Azul cielo' },
  { hex: '#6366f1', name: 'Índigo' },
  { hex: '#a855f7', name: 'Violeta' }
]

export default function AppearancePage({ config }) {
  const g = config.general
  return (
    <>
      <PageHeader title="Apariencia" description="Se aplica a todos los widgets y a este panel." />
      <Group>
        <Row label="Tema" hint="«Sistema» sigue el modo claro u oscuro de tu equipo.">
          <Segmented
            label="Tema"
            value={g.theme}
            onChange={(v) => setGeneral({ theme: v })}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' }
            ]}
          />
        </Row>
        <Row label="Color de acento">
          <div role="radiogroup" aria-label="Color de acento" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                role="radio"
                aria-checked={g.accent === a.hex}
                aria-label={a.name}
                title={a.name}
                onClick={() => setGeneral({ accent: a.hex })}
                className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                style={{
                  background: a.hex,
                  boxShadow: g.accent === a.hex ? `0 0 0 2px var(--panel-bg), 0 0 0 4px ${a.hex}` : 'none'
                }}
              />
            ))}
          </div>
        </Row>
      </Group>
    </>
  )
}
