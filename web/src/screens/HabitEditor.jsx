import { useMemo, useState } from 'react'
import { WEEK_ORDER, frequencyText, goalText, normalizeHabit, normalizeReminders, remindersText, todayKey } from '../../../src/modules/habits/logic.js'
import { getState, selectHabitSettings, selectHabits, useStore, write } from '../store'
import { BackHeader, Group, Row, Segmented, Sheet, Stepper, scrollToTop } from '../ui'

const ICONS = ['💧', '📖', '🏃', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '💊', '🧹', '🌱']
const DAY_LETTERS = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' }
const DAY_NAMES = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado' }
const EVERY = [15, 30, 45, 60, 90, 120, 180, 240]
const INPUT = 'w-full bg-transparent text-[17px] outline-none placeholder:text-fg-3'
const TIME_INPUT = 'rounded-[8px] bg-fill px-2.5 py-1 text-[17px] text-fg outline-none'

// Remove a habit and its log, the same way the PC does.
export function deleteHabit(id) {
  write('habits', id, null)
  for (const d of Object.values(getState().docs)) {
    if (d.collection === 'habitLog' && d.data?.habitId === id) write('habitLog', d.id, null)
  }
}

function initialForm(h) {
  return {
    name: h?.name ?? '',
    icon: h?.icon ?? '💧',
    type: h?.type ?? 'check',
    target: h?.target ?? (h?.type === 'duration' ? 15 : 8),
    countTarget: h?.type === 'count' ? h.target : 8,
    durationTarget: h?.type === 'duration' ? h.target : 15,
    freq: h?.frequency?.kind ?? 'daily',
    days: h?.frequency?.kind === 'days' ? h.frequency.days : [1, 2, 3, 4, 5],
    times: h?.frequency?.kind === 'weekly' ? h.frequency.times : 3,
    reminderTimes: h?.reminders?.times ?? [],
    interval: h?.reminders?.interval ?? null
  }
}

export default function HabitEditor({ habitId, onClose }) {
  const st = useStore()
  const habits = useMemo(() => selectHabits(st.docs), [st.docs])
  const existing = habitId ? habits.find((h) => h.id === habitId) : null
  const [f, setF] = useState(() => initialForm(existing))
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const customIcon = !ICONS.includes(f.icon)

  const build = () => {
    const frequency = f.freq === 'weekly' ? { kind: 'weekly', times: f.times } : f.freq === 'days' ? { kind: 'days', days: f.days } : { kind: 'daily' }
    const target = f.type === 'count' ? f.countTarget : f.type === 'duration' ? f.durationTarget : 1
    const reminders = normalizeReminders({ times: f.reminderTimes, interval: f.interval })
    const today = todayKey(selectHabitSettings(st.docs).dayStartHour ?? 0)
    return normalizeHabit({ name: f.name, icon: f.icon, type: f.type, target, frequency, reminders, id: habitId, createdDay: existing?.createdDay ?? today })
  }

  const save = () => {
    try {
      const h = build()
      const id = habitId ?? crypto.randomUUID()
      const orders = Object.values(st.docs).filter((d) => d.collection === 'habits').map((d) => d.data.order ?? 0)
      const order = existing ? (st.docs[`habits\u0000${id}`]?.data.order ?? 0) : orders.length ? Math.max(...orders) + 1 : 0
      const { id: _id, ...data } = h
      write('habits', id, { ...data, order })
      onClose()
    } catch (err) {
      setError(err.message)
      scrollToTop()
    }
  }

  const preview = (() => {
    try {
      const h = build()
      return [frequencyText(h), goalText(h), remindersText(h)].filter(Boolean).join(' · ')
    } catch {
      return null
    }
  })()

  return (
    <>
      <BackHeader
        back={existing ? 'Atrás' : 'Hoy'}
        onBack={onClose}
        title={existing ? 'Editar hábito' : 'Nuevo hábito'}
        subtitle={preview}
        action={
          <button type="button" data-testid="habit-save" onClick={save} disabled={!f.name.trim()} className="press text-[17px] font-semibold text-accent disabled:opacity-30">
            Guardar
          </button>
        }
      />
      {error && (
        <p role="alert" data-testid="habit-error" className="mx-8 mb-3 text-[15px] text-bad">
          {error}
        </p>
      )}

      <Group>
        <Row>
          <span className="w-8 text-center text-[24px]" aria-hidden>
            {f.icon}
          </span>
          <input
            data-testid="habit-name"
            value={f.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Nombre, por ejemplo «Tomar agua»"
            className={INPUT}
            autoFocus={!existing}
          />
        </Row>
        <div className="grid grid-cols-7 gap-1.5 px-3 py-3">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ícono ${i}`}
              aria-pressed={f.icon === i}
              onClick={() => set({ icon: i })}
              className={`press flex aspect-square items-center justify-center rounded-[10px] text-[22px] ${f.icon === i ? 'bg-accent/20 ring-2 ring-accent' : 'bg-fill'}`}
            >
              {i}
            </button>
          ))}
          <label className={`flex aspect-square items-center justify-center rounded-[10px] ${customIcon ? 'bg-accent/20 ring-2 ring-accent' : 'bg-fill'}`}>
            <span className="sr-only">Otro ícono (escribe un emoji)</span>
            <input
              value={customIcon ? f.icon : ''}
              onChange={(e) => {
                const v = [...e.target.value.trim()].slice(-2).join('')
                if (v) set({ icon: v })
              }}
              placeholder="＋"
              className="w-full bg-transparent text-center text-[20px] outline-none placeholder:text-fg-3"
            />
          </label>
        </div>
      </Group>

      <Group title="Tipo" footer={f.type === 'check' ? 'Lo marcas como hecho o no.' : f.type === 'count' ? 'Sumas de uno en uno hasta tu meta (por ejemplo, vasos de agua).' : 'Sumas minutos hasta tu meta.'}>
        <div className="px-4 py-3">
          <Segmented
            label="Tipo"
            value={f.type}
            onChange={(type) => set({ type })}
            options={[
              { value: 'check', label: 'Sí / no' },
              { value: 'count', label: 'Contador' },
              { value: 'duration', label: 'Minutos' }
            ]}
          />
        </div>
        {f.type === 'count' && (
          <Row>
            <span className="flex-1">Meta al día</span>
            <Stepper label="veces" value={f.countTarget} min={1} max={100} onChange={(v) => set({ countTarget: v })} format={(v) => `${v} ${v === 1 ? 'vez' : 'veces'}`} />
          </Row>
        )}
        {f.type === 'duration' && (
          <Row>
            <span className="flex-1">Meta al día</span>
            <Stepper label="minutos" value={f.durationTarget} min={5} max={600} step={5} onChange={(v) => set({ durationTarget: v })} format={(v) => `${v} min`} />
          </Row>
        )}
      </Group>

      <Group title="Frecuencia">
        <div className="px-4 py-3">
          <Segmented
            label="Frecuencia"
            value={f.freq}
            onChange={(freq) => set({ freq })}
            options={[
              { value: 'daily', label: 'Diario' },
              { value: 'days', label: 'Algunos días' },
              { value: 'weekly', label: 'Por semana' }
            ]}
          />
        </div>
        {f.freq === 'days' && (
          <div className="flex justify-between px-4 pb-3">
            {WEEK_ORDER.map((d) => {
              const on = f.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={DAY_NAMES[d]}
                  aria-pressed={on}
                  onClick={() => set({ days: on ? f.days.filter((x) => x !== d) : [...f.days, d] })}
                  className={`press h-10 w-10 rounded-full text-[15px] font-semibold ${on ? 'bg-accent text-white' : 'bg-fill text-fg-2'}`}
                >
                  {DAY_LETTERS[d]}
                </button>
              )
            })}
          </div>
        )}
        {f.freq === 'weekly' && (
          <Row>
            <span className="flex-1">Veces por semana</span>
            <Stepper label="veces por semana" value={f.times} min={1} max={7} onChange={(v) => set({ times: v })} format={(v) => `${v} ${v === 1 ? 'vez' : 'veces'}`} />
          </Row>
        )}
      </Group>

      <Group title="Recordatorios" footer="Te llegan a este celular (y a tu PC) mientras el hábito esté pendiente.">
        {f.reminderTimes.map((t, i) => (
          <Row key={i}>
            <span className="flex-1">A las</span>
            <input
              type="time"
              aria-label={`Hora del recordatorio ${i + 1}`}
              value={t}
              onChange={(e) => set({ reminderTimes: f.reminderTimes.map((x, j) => (j === i ? e.target.value : x)) })}
              className={TIME_INPUT}
            />
            <button type="button" aria-label="Quitar" onClick={() => set({ reminderTimes: f.reminderTimes.filter((_, j) => j !== i) })} className="press text-[22px] leading-none text-bad">
              ⊖
            </button>
          </Row>
        ))}
        {f.reminderTimes.length < 6 && (
          <Row onClick={() => set({ reminderTimes: [...f.reminderTimes, f.reminderTimes.length ? '21:00' : '09:00'] })}>
            <span className="flex-1 text-accent">Agregar una hora</span>
          </Row>
        )}
        <Row>
          <span className="flex-1">Repetir durante el día</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!f.interval}
            aria-label="Repetir durante el día"
            onClick={() => set({ interval: f.interval ? null : { every: 90, from: '09:00', to: '18:00' } })}
            className={`relative h-[31px] w-[51px] rounded-full transition ${f.interval ? 'bg-good' : 'bg-fill'}`}
          >
            <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${f.interval ? 'left-[22px]' : 'left-[2px]'}`} />
          </button>
        </Row>
        {f.interval && (
          <>
            <Row>
              <span className="flex-1">Cada</span>
              <select value={f.interval.every} onChange={(e) => set({ interval: { ...f.interval, every: Number(e.target.value) } })} className={TIME_INPUT} aria-label="Cada cuánto">
                {EVERY.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`}
                  </option>
                ))}
              </select>
            </Row>
            <Row>
              <span className="flex-1">Desde</span>
              <input type="time" aria-label="Desde" value={f.interval.from} onChange={(e) => set({ interval: { ...f.interval, from: e.target.value } })} className={TIME_INPUT} />
              <span className="text-fg-3">hasta</span>
              <input type="time" aria-label="Hasta" value={f.interval.to} onChange={(e) => set({ interval: { ...f.interval, to: e.target.value } })} className={TIME_INPUT} />
            </Row>
          </>
        )}
      </Group>

      {existing && (
        <Group footer="Se borra también su historial, en todos tus dispositivos.">
          <Row onClick={() => setConfirm(true)}>
            <span className="flex-1 text-center text-bad">Eliminar hábito</span>
          </Row>
        </Group>
      )}

      {confirm && (
        <Sheet
          title={`¿Eliminar «${existing.name}»?`}
          subtitle="Se borran también su racha y su historial."
          actions={[
            {
              label: 'Eliminar hábito',
              danger: true,
              onClick: () => {
                deleteHabit(existing.id)
                onClose()
              }
            }
          ]}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  )
}
