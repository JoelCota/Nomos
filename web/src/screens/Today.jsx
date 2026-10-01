import { useMemo, useState } from 'react'
import { addDays, dayItems, perfectStreak, progressText, recentDays, streak, streakText, todayKey } from '../../../src/modules/habits/logic.js'
import { LOCALE } from '../../../src/shared/time.js'
import { selectHabitSettings, selectHabits, selectLog, useStore, write } from '../store'
import { Banner, Header, Ring, Segmented, Sheet, haptic, scrollToTop } from '../ui'
import HabitEditor from './HabitEditor'
import HabitsList from './HabitsList'

const MAX_VALUE = 100000

function setValue(habit, day, value) {
  let v = Math.max(0, Math.min(MAX_VALUE, Math.round(value)))
  if (habit.type === 'check') v = v > 0 ? 1 : 0
  write('habitLog', `${day}|${habit.id}`, v > 0 ? { day, habitId: habit.id, value: v } : null)
}

const primaryStep = (h) => (h.type === 'count' ? 1 : h.type === 'duration' ? 5 : 1)

function primary(item, day) {
  const h = item.habit
  haptic()
  if (h.type === 'check') setValue(h, day, item.value > 0 ? 0 : 1)
  else setValue(h, day, item.value + primaryStep(h))
}

function sheetActions(item, day) {
  const h = item.habit
  const v = item.value
  if (h.type === 'check') {
    return [v > 0 ? { label: 'Desmarcar', onClick: () => setValue(h, day, 0), danger: true } : { label: 'Marcar como hecho', onClick: () => setValue(h, day, 1) }]
  }
  if (h.type === 'count') {
    return [
      { label: '+1', onClick: () => setValue(h, day, v + 1) },
      ...(v > 0 ? [{ label: '−1', onClick: () => setValue(h, day, v - 1) }] : []),
      { label: `Completar (${item.target})`, onClick: () => setValue(h, day, Math.max(v, item.target)) },
      ...(v > 0 ? [{ label: 'Volver a 0', onClick: () => setValue(h, day, 0), danger: true }] : [])
    ]
  }
  return [
    { label: '+5 min', onClick: () => setValue(h, day, v + 5) },
    { label: '+15 min', onClick: () => setValue(h, day, v + 15) },
    { label: '+30 min', onClick: () => setValue(h, day, v + 30) },
    ...(v > 0 ? [{ label: '−5 min', onClick: () => setValue(h, day, v - 5) }] : []),
    ...(v > 0 ? [{ label: 'Volver a 0', onClick: () => setValue(h, day, 0), danger: true }] : [])
  ]
}

function ActionButton({ item, day }) {
  const h = item.habit
  const label =
    h.type === 'check' ? (item.value > 0 ? `Desmarcar ${h.name}` : `Marcar ${h.name}`) : h.type === 'count' ? `Sumar 1 a ${h.name}` : `Sumar 5 minutos a ${h.name}`
  if (h.type === 'check') {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={item.value > 0}
        data-testid={`habit-action-${h.id}`}
        onClick={() => primary(item, day)}
        className={`press flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 transition ${
          item.value > 0 ? 'pop border-good bg-good text-white' : 'border-fg-3/40'
        }`}
      >
        {item.value > 0 && (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    )
  }
  return (
    <button type="button" aria-label={label} data-testid={`habit-action-${h.id}`} onClick={() => primary(item, day)} className="press shrink-0">
      <Ring value={item.value / item.target} size={36} stroke={3.5} color={item.done ? 'var(--good)' : 'var(--accent)'}>
        <span className={`text-[11px] font-bold ${item.done ? 'text-good' : 'text-accent'}`}>{h.type === 'count' ? '+1' : '+5'}</span>
      </Ring>
    </button>
  )
}

function HabitRow({ item, day, log, today, onMore }) {
  const h = item.habit
  const s = streak(h, log, today)
  const detail = [progressText(item), s.count > 0 ? `🔥 ${streakText(s)}` : null].filter(Boolean).join(' · ')
  return (
    <div data-testid="habit-row" className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
      <button type="button" onClick={onMore} className="press flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Más opciones para ${h.name}`}>
        <span className="w-8 shrink-0 text-center text-[24px]" aria-hidden>
          {h.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[17px] ${item.settled ? 'text-fg-3' : ''}`}>{h.name}</span>
          <span className="tnum block truncate text-[13px] text-fg-3">{detail || ' '}</span>
          <span className="mt-1 flex gap-[3px]" aria-hidden>
            {recentDays(h, log, today, 7).map((d) => (
              <span
                key={d.day}
                className={`h-[5px] w-[14px] rounded-full ${d.done ? 'bg-accent' : d.required && d.active && d.day < today ? 'bg-fill' : 'bg-transparent ring-1 ring-inset ring-line'}`}
              />
            ))}
          </span>
        </span>
      </button>
      <ActionButton item={item} day={day} />
    </div>
  )
}

export default function Today() {
  const st = useStore()
  const [which, setWhich] = useState('today')
  const [sheet, setSheet] = useState(null)
  // Pushed screens: { kind: 'list' } | { kind: 'edit', id, from } | { kind: 'new', from }
  const [screen, setScreenRaw] = useState(null)
  const setScreen = (s) => {
    setScreenRaw(s)
    scrollToTop()
  }

  const { habits, log, settings } = useMemo(
    () => ({ habits: selectHabits(st.docs), log: selectLog(st.docs), settings: selectHabitSettings(st.docs) }),
    [st.docs]
  )
  const today = todayKey(settings.dayStartHour ?? 0)
  const day = which === 'today' ? today : addDays(today, -1)
  const items = dayItems(habits, log, day)
  const done = items.filter((i) => i.settled).length
  const perfect = perfectStreak(habits, log, today)
  const rawDate = new Date(`${day}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
  const dateText = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  if (screen?.kind === 'list') {
    return <HabitsList onBack={() => setScreen(null)} onEdit={(id) => setScreen({ kind: 'edit', id, from: 'list' })} onNew={() => setScreen({ kind: 'new', from: 'list' })} />
  }
  if (screen?.kind === 'edit' || screen?.kind === 'new') {
    const back = () => setScreen(screen.from === 'list' ? { kind: 'list' } : null)
    return <HabitEditor key={screen.id ?? 'new'} habitId={screen.kind === 'edit' ? screen.id : null} onClose={back} />
  }

  return (
    <>
      <Header
        title={which === 'today' ? 'Hoy' : 'Ayer'}
        subtitle={dateText}
        right={
          <button type="button" data-testid="new-habit" aria-label="Nuevo hábito" onClick={() => setScreen({ kind: 'new' })} className="press -mr-1 px-1 text-[30px] font-light leading-none text-accent">
            +
          </button>
        }
      />
      {!st.online && <Banner>Sin conexión. Tus cambios se enviarán al volver.</Banner>}
      <div className="mx-4 mb-5">
        <Segmented
          label="Día"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'today', label: 'Hoy' },
            { value: 'yesterday', label: 'Ayer' }
          ]}
        />
      </div>

      {habits.length === 0 ? (
        <p className="mx-6 mt-10 text-center text-[16px] text-fg-3">
          {st.seq === 0 && st.syncing ? 'Cargando tus hábitos…' : 'Todavía no tienes hábitos.'}
          {!(st.seq === 0 && st.syncing) && (
            <button type="button" onClick={() => setScreen({ kind: 'new' })} className="press mt-4 block w-full rounded-[12px] bg-accent py-3 text-[17px] font-semibold text-white">
              Crear mi primer hábito
            </button>
          )}
        </p>
      ) : (
        <>
          <section className="mx-4 mb-6 flex items-center gap-4 rounded-[14px] bg-card p-4">
            <Ring value={items.length ? done / items.length : 0} size={64} stroke={7} color={done === items.length && items.length ? 'var(--good)' : 'var(--accent)'}>
              <span data-testid="today-progress" className="tnum text-[15px] font-bold">
                {done}/{items.length}
              </span>
            </Ring>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold">
                {items.length === 0 ? 'Nada para este día' : done === items.length ? '¡Todo listo! 🎉' : `Te ${items.length - done === 1 ? 'falta 1' : `faltan ${items.length - done}`}`}
              </p>
              <p className="text-[15px] text-fg-3">{perfect > 0 ? `🔥 ${perfect} ${perfect === 1 ? 'día perfecto' : 'días perfectos'}` : 'Completa hoy para empezar tu racha'}</p>
            </div>
          </section>
          {items.length > 0 && (
            <div className="mx-4 mb-6 divide-y divide-line overflow-hidden rounded-[14px] bg-card">
              {items.map((item) => (
                <HabitRow key={item.habit.id} item={item} day={day} log={log} today={today} onMore={() => setSheet(item)} />
              ))}
            </div>
          )}
          <button type="button" data-testid="all-habits" onClick={() => setScreen({ kind: 'list' })} className="press mx-4 mb-6 flex w-[calc(100%-2rem)] items-center justify-between rounded-[14px] bg-card px-4 py-3 text-[17px]">
            <span>Mis hábitos</span>
            <span className="flex items-center gap-1 text-[15px] text-fg-3">
              {habits.length}
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </>
      )}

      {sheet && (
        <Sheet
          title={`${sheet.habit.icon} ${sheet.habit.name}`}
          subtitle={progressText(sheet) || (sheet.value > 0 ? 'Hecho' : 'Pendiente')}
          actions={[
            ...sheetActions(dayItems([sheet.habit], log, day)[0] ?? sheet, day),
            { label: 'Editar hábito', onClick: () => setScreen({ kind: 'edit', id: sheet.habit.id }) }
          ]}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
