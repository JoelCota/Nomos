import { useState } from 'react'
import { Button, Group, Row, Segmented, Select, Switch } from '../../../renderer/src/ui/controls'
import { setModuleSettings } from '../../../renderer/src/lib/ipc'
import useNow from '../../../renderer/src/hooks/useNow'
import { CITIES, MAX_WORLD_CLOCKS, formatHM, relativeText, zonedParts } from '../zones'
import { is12h } from './FlipClock'

export default function ClockPanel({ settings }) {
  const set = (patch) => setModuleSettings('clock', patch)
  const now = useNow()
  const clocks = settings.worldClocks ?? []
  const available = CITIES.filter((c) => !clocks.some((w) => w.tz === c.tz))
  const [pick, setPick] = useState('')
  const hour12 = is12h(settings.clockFormat)

  const add = () => {
    const city = CITIES.find((c) => c.tz === (pick || available[0]?.tz))
    if (!city || clocks.length >= MAX_WORLD_CLOCKS) return
    set({ worldClocks: [...clocks, city] })
    setPick('')
  }

  return (
    <>
      <Group title="Reloj">
        <Row label="Estilo">
          <Segmented
            label="Estilo"
            value={settings.style}
            onChange={(v) => set({ style: v })}
            options={[
              { value: 'flip', label: 'Flip' },
              { value: 'analog', label: 'Analógico' }
            ]}
          />
        </Row>
        {settings.style === 'analog' ? (
          <Row label="Segundero">
            <Switch label="Segundero" checked={settings.showSeconds !== false} onChange={(v) => set({ showSeconds: v })} />
          </Row>
        ) : (
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
        )}
      </Group>

      <Group
        title="Otras ciudades"
        footer={`Aparecen en el tamaño Grande del widget, hasta ${MAX_WORLD_CLOCKS}. Con el estilo analógico, la esfera es clara de día y oscura de noche.`}
      >
        {clocks.map((c, i) => {
          const p = zonedParts(now, c.tz)
          return (
            <div key={c.tz} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.city}</p>
                <p className="text-[12px] text-fg-3">{relativeText(now, c.tz)}</p>
              </div>
              <span className="tnum text-[15px] font-semibold">{formatHM(p, hour12)}</span>
              <button
                type="button"
                aria-label={`Quitar ${c.city}`}
                onClick={() => set({ worldClocks: clocks.filter((_, j) => j !== i) })}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-red-500/10 hover:text-red-500"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                  <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>
          )
        })}
        {clocks.length < MAX_WORLD_CLOCKS ? (
          <Row label={clocks.length ? 'Añadir otra ciudad' : 'Añadir una ciudad'} htmlFor="world-city">
            <Select
              id="world-city"
              label="Ciudad"
              value={pick || available[0]?.tz}
              onChange={setPick}
              options={available.map((c) => ({ value: c.tz, label: c.city }))}
            />
            <Button onClick={add}>Añadir</Button>
          </Row>
        ) : (
          <p className="px-4 py-3 text-[12px] text-fg-3">Ya tienes {MAX_WORLD_CLOCKS} ciudades. Quita una para añadir otra.</p>
        )}
      </Group>
    </>
  )
}
