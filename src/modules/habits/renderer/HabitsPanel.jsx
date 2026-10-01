import { useMemo, useState } from 'react'
import { Button, Group, Row, Segmented, Select, Stepper, Switch } from '../../../renderer/src/ui/controls'
import { setModuleSettings } from '../../../renderer/src/lib/ipc'
import {
  TYPE_LABELS,
  WEEKDAY_LETTERS,
  WEEK_ORDER,
  addDays,
  bestStreak,
  completionRate,
  dayProgress,
  frequencyText,
  goalText,
  isDoneOn,
  isRequiredOn,
  mondayOf,
  perfectStreak,
  remindersText,
  streak,
  streakText
} from '../logic'
import { errorText, habitsApi, useHabitsData } from './useHabits'
import { invoke } from '../../../renderer/src/lib/ipc'

const TABS = [
  { value: 'today', label: 'Hoy' },
  { value: 'habits', label: 'Mis hábitos' },
  { value: 'history', label: 'Historial' },
  { value: 'options', label: 'Opciones' }
]

const ICONS = ['💧', '📖', '🏃', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '💊', '🧹', '🌱']
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export default function HabitsPanel({ settings }) {
  const data = useHabitsData()
  const [tab, setTab] = useState('today')
  const [editing, setEditing] = useState(null) // null | 'new' | habit id

  if (!data) return null
  const startNew = () => {
    setEditing('new')
    setTab('habits')
  }

  return (
    <div>
      <div className="mb-5">
        <Segmented label="Secciones de Hábitos" options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'today' && <TodayTab data={data} onCreate={startNew} />}
      {tab === 'habits' && <HabitsTab data={data} editing={editing} setEditing={setEditing} />}
      {tab === 'history' && <HistoryTab data={data} onCreate={startNew} />}
      {tab === 'options' && <OptionsTab settings={settings} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Today / yesterday

function CheckButton({ checked, onChange, label }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition ${
        checked ? 'bg-accent text-white' : 'border-2 border-[var(--track)] text-transparent hover:border-accent hover:text-accent'
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M1.5 5.2l2.3 2.3L8.5 2.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function MinutesControl({ value, onSet, label }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft === null) return
    const n = Math.max(0, Math.round(Number(draft) || 0))
    setDraft(null)
    onSet(n)
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button onClick={() => onSet(Math.max(0, value - 5))} aria-label={`Restar 5 minutos a ${label}`} disabled={value <= 0}>
        −5
      </Button>
      <label className="flex items-center gap-1 rounded-lg bg-control px-2 py-1">
        <input
          type="number"
          min={0}
          aria-label={`Minutos de ${label}`}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="tnum w-12 bg-transparent text-right text-[13px] outline-none"
        />
        <span className="text-[12px] text-fg-3">min</span>
      </label>
      <Button onClick={() => onSet(value + 5)} aria-label={`Sumar 5 minutos a ${label}`}>
        +5
      </Button>
      <Button onClick={() => onSet(value + 15)} aria-label={`Sumar 15 minutos a ${label}`}>
        +15
      </Button>
    </div>
  )
}

function TodayTab({ data, onCreate }) {
  const [which, setWhich] = useState('today')
  const [error, setError] = useState(null)
  const day = which === 'today' ? data.today : addDays(data.today, -1)
  const progress = dayProgress(data.habits, data.log, day)
  const perfect = perfectStreak(data.habits, data.log, data.today)

  const run = (p) => p.then(() => setError(null)).catch((e) => setError(errorText(e)))

  if (!data.habits.length) {
    return (
      <div className="rounded-xl bg-group px-6 py-10 text-center">
        <p className="text-[13px] text-fg-2">Crea tu primer hábito para verlo aquí y en el widget.</p>
        <Button variant="primary" className="mt-4" onClick={onCreate}>
          Crear un hábito
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-group px-4 py-3">
          <p className="tnum text-[24px] font-semibold leading-tight">
            {progress.done} de {progress.total}
          </p>
          <p className="text-[12px] text-fg-3">{which === 'today' ? 'hábitos hechos hoy' : 'hábitos hechos ayer'}</p>
        </div>
        <div className="rounded-xl bg-group px-4 py-3">
          <p className="tnum text-[24px] font-semibold leading-tight">🔥 {perfect}</p>
          <p className="text-[12px] text-fg-3">{perfect === 1 ? 'día perfecto seguido' : 'días perfectos seguidos'}</p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <Segmented
          label="Día"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'today', label: 'Hoy' },
            { value: 'yesterday', label: 'Ayer' }
          ]}
        />
        <span className="text-[12px] text-fg-3">
          {new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {progress.items.length === 0 ? (
        <p className="rounded-xl bg-group px-4 py-8 text-center text-[13px] text-fg-3">No había hábitos programados ese día.</p>
      ) : (
        <Group footer="Solo se pueden corregir hoy y ayer.">
          {progress.items.map((item) => {
            const h = item.habit
            const hint = [goalText(h), item.week ? `${item.week.count} de ${item.week.times} esta semana` : frequencyText(h)]
              .filter(Boolean)
              .join(', ')
            return (
              <Row key={h.id} label={`${h.icon}  ${h.name}`} hint={hint}>
                {h.type === 'check' && (
                  <CheckButton label={`${h.name} hecho`} checked={item.done} onChange={(v) => run(habitsApi.setValue(h.id, day, v ? 1 : 0))} />
                )}
                {h.type === 'count' && (
                  <>
                    <span className={`text-[12px] ${item.done ? 'text-accent' : 'text-fg-3'}`}>{item.done ? 'Meta cumplida' : `Meta: ${item.target}`}</span>
                    <Stepper label={h.name} value={item.value} min={0} max={999} onChange={(v) => run(habitsApi.setValue(h.id, day, v))} />
                  </>
                )}
                {h.type === 'duration' && <MinutesControl label={h.name} value={item.value} onSet={(v) => run(habitsApi.setValue(h.id, day, v))} />}
              </Row>
            )
          })}
        </Group>
      )}
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Create / edit / reorder

const emptyForm = () => ({
  name: '',
  icon: '💧',
  type: 'check',
  countTarget: 8,
  durationTarget: 30,
  kind: 'daily',
  days: [1, 2, 3, 4, 5],
  times: 3,
  remindAt: [],
  intervalOn: false,
  every: 90,
  from: '09:00',
  to: '18:00'
})

const formFromHabit = (h) => ({
  ...emptyForm(),
  name: h.name,
  icon: h.icon,
  type: h.type,
  countTarget: h.type === 'count' ? h.target : 8,
  durationTarget: h.type === 'duration' ? h.target : 30,
  kind: h.frequency.kind,
  days: h.frequency.kind === 'days' ? h.frequency.days : [1, 2, 3, 4, 5],
  times: h.frequency.kind === 'weekly' ? h.frequency.times : 3,
  remindAt: h.reminders?.times ?? [],
  intervalOn: !!h.reminders?.interval,
  every: h.reminders?.interval?.every ?? 90,
  from: h.reminders?.interval?.from ?? '09:00',
  to: h.reminders?.interval?.to ?? '18:00'
})

const timeInput =
  'rounded-lg bg-control px-2 py-1 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent'
const nextSuggestedTime = (list) => ['09:00', '21:00', '13:00', '18:00', '07:00', '23:00'].find((t) => !list.includes(t)) ?? '12:00'

function HabitForm({ initial, onSave, onCancel, isNew }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setF((p) => ({ ...p, ...patch }))
  const toggleDay = (d) => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name: f.name,
        icon: f.icon,
        type: f.type,
        target: f.type === 'count' ? f.countTarget : f.type === 'duration' ? f.durationTarget : 1,
        frequency: f.kind === 'days' ? { kind: 'days', days: f.days } : f.kind === 'weekly' ? { kind: 'weekly', times: f.times } : { kind: 'daily' },
        reminders: { times: f.remindAt, interval: f.intervalOn ? { every: f.every, from: f.from, to: f.to } : null }
      })
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  const typeHint = {
    check: 'Se marca una vez: hecho o no hecho.',
    count: 'Cada clic en el widget suma 1 hasta llegar a la meta.',
    duration: 'Suma minutos a mano o desde un foco del Pomodoro.'
  }[f.type]

  return (
    <form onSubmit={submit} className="mb-6">
      <Group title={isNew ? 'Nuevo hábito' : 'Editar hábito'}>
        <Row label="Nombre" htmlFor="habit-name">
          <input
            id="habit-name"
            autoFocus
            value={f.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Por ejemplo, tomar agua"
            className="w-60 rounded-lg bg-control px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Row>
        <Row label="Ícono">
          <div role="radiogroup" aria-label="Ícono" className="flex flex-wrap justify-end gap-1" style={{ maxWidth: 300 }}>
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={f.icon === i}
                onClick={() => set({ icon: i })}
                className={`h-7 w-7 rounded-lg text-[15px] ${f.icon === i ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-[var(--track)]'}`}
              >
                {i}
              </button>
            ))}
            <input
              aria-label="Otro ícono (emoji)"
              value={ICONS.includes(f.icon) ? '' : f.icon}
              onChange={(e) => set({ icon: e.target.value || '💧' })}
              placeholder="Otro"
              maxLength={8}
              className="h-7 w-14 rounded-lg bg-control px-1.5 text-center text-[13px] outline-none placeholder:text-fg-3"
            />
          </div>
        </Row>
        <Row label="Tipo" hint={typeHint}>
          <Segmented label="Tipo" value={f.type} onChange={(v) => set({ type: v })} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        </Row>
        {f.type === 'count' && (
          <Row label="Meta diaria">
            <Stepper label="veces al día" value={f.countTarget} min={1} max={100} suffix=" veces" onChange={(v) => set({ countTarget: v })} />
          </Row>
        )}
        {f.type === 'duration' && (
          <Row label="Meta diaria">
            <Stepper label="minutos al día" value={f.durationTarget} min={5} max={600} step={5} suffix=" min" onChange={(v) => set({ durationTarget: v })} />
          </Row>
        )}
        <Row
          label="Frecuencia"
          hint={f.kind === 'weekly' ? 'Cualquier día cuenta; la racha se mide en semanas cumplidas.' : f.kind === 'days' ? 'Los demás días no rompen la racha.' : undefined}
        >
          <Segmented
            label="Frecuencia"
            value={f.kind}
            onChange={(v) => set({ kind: v })}
            options={[
              { value: 'daily', label: 'Todos los días' },
              { value: 'days', label: 'Algunos días' },
              { value: 'weekly', label: 'Por semana' }
            ]}
          />
        </Row>
        {f.kind === 'days' && (
          <Row label="Días">
            <div className="flex gap-1">
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={f.days.includes(d)}
                  aria-label={WEEKDAY_NAMES[d]}
                  title={WEEKDAY_NAMES[d]}
                  onClick={() => toggleDay(d)}
                  className={`h-7 w-7 rounded-full text-[12px] font-semibold ${f.days.includes(d) ? 'bg-accent text-white' : 'bg-control text-fg-2'}`}
                >
                  {WEEKDAY_LETTERS[d]}
                </button>
              ))}
            </div>
          </Row>
        )}
        {f.kind === 'weekly' && (
          <Row label="Veces por semana">
            <Stepper label="veces por semana" value={f.times} min={1} max={7} onChange={(v) => set({ times: v })} />
          </Row>
        )}
        <Row label="Avisarme a las" hint="Solo si todavía no lo has hecho ese día.">
          <div className="flex flex-wrap items-center justify-end gap-1.5" style={{ maxWidth: 330 }}>
            {f.remindAt.map((t, i) => (
              <span key={i} className="flex items-center rounded-lg bg-control pr-1">
                <input
                  type="time"
                  aria-label={`Hora de aviso ${i + 1}`}
                  value={t}
                  onChange={(e) => set({ remindAt: f.remindAt.map((x, j) => (j === i ? e.target.value : x)) })}
                  className="bg-transparent px-2 py-1 text-[13px] text-fg outline-none"
                />
                <button
                  type="button"
                  aria-label={`Quitar aviso de las ${t}`}
                  onClick={() => set({ remindAt: f.remindAt.filter((_, j) => j !== i) })}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-fg-3 hover:bg-[var(--track)] hover:text-fg"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
                    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              </span>
            ))}
            {f.remindAt.length < 6 && (
              <Button onClick={() => set({ remindAt: [...f.remindAt, nextSuggestedTime(f.remindAt)] })}>Añadir hora</Button>
            )}
          </div>
        </Row>
        <Row label="Repetir durante el día" hint={f.intervalOn ? undefined : 'Útil para cosas como tomar agua.'}>
          <Switch label="Repetir durante el día" checked={f.intervalOn} onChange={(v) => set({ intervalOn: v })} />
        </Row>
        {f.intervalOn && (
          <Row label="Cada">
            <Stepper label="minutos entre avisos" value={f.every} min={15} max={240} step={15} suffix=" min" onChange={(v) => set({ every: v })} />
            <span className="text-[12px] text-fg-3">de</span>
            <input type="time" aria-label="Desde" value={f.from} onChange={(e) => set({ from: e.target.value })} className={timeInput} />
            <span className="text-[12px] text-fg-3">a</span>
            <input type="time" aria-label="Hasta" value={f.to} onChange={(e) => set({ to: e.target.value })} className={timeInput} />
          </Row>
        )}
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          {error && <p className="mr-auto text-[12px] text-red-500">{error}</p>}
          <Button onClick={onCancel}>Cancelar</Button>
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50">
            {isNew ? 'Crear hábito' : 'Guardar cambios'}
          </button>
        </div>
      </Group>
    </form>
  )
}

function HabitsTab({ data, editing, setEditing }) {
  const close = () => setEditing(null)
  const editingHabit = editing && editing !== 'new' ? data.habits.find((h) => h.id === editing) : null

  return (
    <>
      {editing === 'new' && (
        <HabitForm
          isNew
          initial={emptyForm()}
          onCancel={close}
          onSave={async (h) => {
            await habitsApi.create(h)
            close()
          }}
        />
      )}
      {editingHabit && (
        <HabitForm
          key={editingHabit.id}
          initial={formFromHabit(editingHabit)}
          onCancel={close}
          onSave={async (h) => {
            await habitsApi.update(editingHabit.id, h)
            close()
          }}
        />
      )}
      {editing !== 'new' && !editingHabit && (
        <div className="mb-4">
          <Button variant="primary" onClick={() => setEditing('new')}>
            Nuevo hábito
          </Button>
        </div>
      )}

      {data.habits.length === 0 ? (
        editing !== 'new' && <p className="py-8 text-center text-[13px] text-fg-3">Aún no tienes hábitos. Empieza con uno pequeño, como tomar agua.</p>
      ) : (
        <Group title="Tus hábitos" footer="Eliminar un hábito borra también su historial.">
          {data.habits.map((h, i) => {
            const s = streak(h, data.log, data.today)
            return (
              <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-center text-[17px]" aria-hidden>
                  {h.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{h.name}</p>
                  <p className="truncate text-[12px] text-fg-3">
                    {[goalText(h), frequencyText(h)].filter(Boolean).join(', ')}
                    {remindersText(h) && <span className="ml-1.5">{remindersText(h)}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-fg-2" title="Racha actual">
                  🔥 {streakText(s)}
                </span>
                <div className="flex shrink-0 items-center">
                  <button type="button" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => habitsApi.move(h.id, -1)} className="h-7 w-7 rounded text-fg-3 hover:text-fg disabled:opacity-25">
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${h.name}`}
                    disabled={i === data.habits.length - 1}
                    onClick={() => habitsApi.move(h.id, 1)}
                    className="h-7 w-7 rounded text-fg-3 hover:text-fg disabled:opacity-25"
                  >
                    ↓
                  </button>
                </div>
                <Button variant="plain" onClick={() => setEditing(h.id)}>
                  Editar
                </Button>
                <button
                  type="button"
                  aria-label={`Eliminar ${h.name}`}
                  title="Eliminar"
                  onClick={() => {
                    if (confirm(`¿Eliminar «${h.name}» y todo su historial?`)) habitsApi.remove(h.id)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-red-500/10 hover:text-red-500"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )
          })}
        </Group>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// History: streaks and a 12-week calendar per habit

const WEEKS = 12

function Calendar({ habit, log, today }) {
  const start = addDays(mondayOf(today), -(WEEKS - 1) * 7)
  const weeks = []
  for (let w = 0; w < WEEKS; w++) {
    const days = []
    for (let i = 0; i < 7; i++) days.push(addDays(start, w * 7 + i))
    weeks.push(days)
  }
  const cell = (d) => {
    if (d > today || d < habit.createdDay) return 'bg-transparent'
    if (isDoneOn(habit, log, d)) return 'bg-accent'
    if (isRequiredOn(habit, d) && d !== today) return 'bg-[var(--track)]'
    return 'border border-[var(--track)]'
  }
  const monthOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')

  return (
    <div className="overflow-x-auto px-4 py-4">
      <div className="inline-flex gap-[4px]">
        <div className="mr-1 flex flex-col gap-[4px] pt-[18px]" aria-hidden>
          {WEEK_ORDER.map((d) => (
            <span key={d} className="h-[16px] text-[10px] leading-[16px] text-fg-3">
              {WEEKDAY_LETTERS[d]}
            </span>
          ))}
        </div>
        {weeks.map((days, w) => (
          <div key={w} className="flex flex-col gap-[4px]">
            <span className="h-[14px] text-[10px] text-fg-3" aria-hidden>
              {w === 0 || monthOf(days[0]) !== monthOf(weeks[w - 1][0]) ? monthOf(days[0]) : ''}
            </span>
            {days.map((d) => (
              <span key={d} title={new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} className={`h-[16px] w-[16px] rounded-[4px] ${cell(d)}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[3px] bg-accent" /> Hecho
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[3px] bg-[var(--track)]" /> No hecho
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[3px] border border-[var(--track)]" /> No tocaba
        </span>
      </div>
    </div>
  )
}

function HistoryTab({ data, onCreate }) {
  const [selected, setSelected] = useState(null)
  const habit = data.habits.find((h) => h.id === selected) ?? data.habits[0]
  const stats = useMemo(() => {
    if (!habit) return null
    const rate = completionRate(habit, data.log, data.today)
    return {
      current: streak(habit, data.log, data.today),
      best: bestStreak(habit, data.log, data.today),
      rate
    }
  }, [habit, data])

  if (!habit) {
    return (
      <div className="rounded-xl bg-group px-6 py-10 text-center">
        <p className="text-[13px] text-fg-2">El historial aparecerá cuando tengas algún hábito.</p>
        <Button variant="primary" className="mt-4" onClick={onCreate}>
          Crear un hábito
        </Button>
      </div>
    )
  }

  const tile = (value, label) => (
    <div className="rounded-xl bg-group px-4 py-3">
      <p className="tnum text-[22px] font-semibold leading-tight">{value}</p>
      <p className="text-[12px] text-fg-3">{label}</p>
    </div>
  )

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="history-habit" className="text-[13px] text-fg-2">
          Hábito
        </label>
        <Select
          id="history-habit"
          label="Hábito"
          value={habit.id}
          onChange={setSelected}
          options={data.habits.map((h) => ({ value: h.id, label: `${h.icon} ${h.name}` }))}
        />
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {tile(streakText(stats.current), 'racha actual')}
        {tile(streakText(stats.best), 'mejor racha')}
        {tile(stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`, habit.frequency.kind === 'weekly' ? 'semanas cumplidas (último mes)' : 'cumplido (últimos 30 días)')}
      </div>
      <Group title="Últimas 12 semanas">
        <Calendar habit={habit} log={data.log} today={data.today} />
      </Group>
    </>
  )
}

// ---------------------------------------------------------------------------

function OptionsTab({ settings }) {
  const set = (patch) => setModuleSettings('habits', patch)
  const h = settings.dayStartHour ?? 0
  const [tested, setTested] = useState(false)
  return (
    <>
      <Group
        title="Recordatorios"
        footer="Mientras haya un foco del Pomodoro en marcha, los avisos esperan y aparecen al terminar."
      >
        <Row label="Avisos de hábitos" hint="Cada hábito elige sus horas en «Mis hábitos».">
          <Switch label="Avisos de hábitos" checked={settings.remindersEnabled !== false} onChange={(v) => set({ remindersEnabled: v })} />
        </Row>
        <Row label="Sonido de los avisos">
          <Switch label="Sonido de los avisos" checked={settings.reminderSound !== false} onChange={(v) => set({ reminderSound: v })} />
        </Row>
        <Row label="Resumen del día" hint="Un aviso con lo que te falta. Si ya hiciste todo, no aparece." htmlFor="summary-time">
          <input
            id="summary-time"
            type="time"
            aria-label="Hora del resumen"
            disabled={!settings.summaryEnabled}
            value={settings.summaryTime ?? '20:30'}
            onChange={(e) => e.target.value && set({ summaryTime: e.target.value })}
            className={`${timeInput} disabled:opacity-40`}
          />
          <Switch label="Resumen del día" checked={!!settings.summaryEnabled} onChange={(v) => set({ summaryEnabled: v })} />
        </Row>
        <Row label="Ver cómo se ve un aviso">
          <Button
            onClick={() => {
              invoke('habits:test-reminder')
              setTested(true)
            }}
          >
            {tested ? 'Mostrar otro' : 'Mostrar un aviso de prueba'}
          </Button>
        </Row>
      </Group>

      <Group title="Día y widget">
        <Row
          label="El día empieza a las"
          hint={h === 0 ? 'A medianoche.' : `Lo que marques antes de las ${h}:00 cuenta para el día anterior.`}
        >
          <Stepper label="hora de inicio del día" value={h} min={0} max={8} suffix=":00" onChange={(v) => set({ dayStartHour: v })} />
        </Row>
        <Row label="Mostrar en el widget los hábitos ya hechos" hint="Si lo desactivas, el widget solo lista lo pendiente.">
          <Switch label="Mostrar hábitos hechos en el widget" checked={settings.showCompleted !== false} onChange={(v) => set({ showCompleted: v })} />
        </Row>
      </Group>
    </>
  )
}
