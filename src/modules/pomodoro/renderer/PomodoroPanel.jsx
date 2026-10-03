import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Button, Group, Row, Segmented, Select, Stepper, Switch } from '../../../renderer/src/ui/controls'
import { setModule } from '../../../renderer/src/lib/ipc'
import TasksList from '../../tasks/renderer/TasksList'
import { useTasksData } from '../../tasks/renderer/useTasks'
import { setModuleSettings } from '../../../renderer/src/lib/ipc'
import { countByDay, currentStreak, lastNDays } from '../../../renderer/src/lib/stats'
import { formatTime, isToday } from '../../../shared/time'
import useIpcState from '../../../renderer/src/hooks/useIpcState'
import { PHASE_LABELS, pomodoro, usePomodoroData, usePomodoroState } from './usePomodoro'

const TABS = [
  { value: 'timer', label: 'Temporizador' },
  { value: 'tasks', label: 'Tareas' },
  { value: 'stats', label: 'Estadísticas' },
  { value: 'options', label: 'Opciones' }
]

export default function PomodoroPanel({ settings, config }) {
  const [tab, setTab] = useState('timer')
  const state = usePomodoroState()
  const data = usePomodoroData()
  // Tasks come from the Tasks module while it is enabled.
  const tasksEnabled = !!config?.modules.tasks?.enabled
  const tasks = useTasksData()?.tasks ?? []
  // Duration habits can be the session target while the Habits module is on.
  const habitsData = useIpcState('habits:get-data', 'habits:data')
  const durationHabits = config?.modules.habits?.enabled ? (habitsData?.habits ?? []).filter((h) => h.type === 'duration') : []
  const set = (patch) => setModuleSettings('pomodoro', patch)

  return (
    <div>
      <div className="mb-5">
        <Segmented label="Secciones del Pomodoro" options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'timer' && state && <TimerTab state={state} settings={settings} tasks={tasksEnabled ? tasks : []} habits={durationHabits} set={set} />}
      {tab === 'tasks' &&
        (tasksEnabled ? (
          <TasksList tasks={tasks} currentTaskId={state?.currentTaskId} />
        ) : (
          <div className="rounded-xl bg-group px-6 py-10 text-center">
            <p className="text-[13px] text-fg-2">Las tareas ahora son un módulo aparte. Actívalo para elegir tareas como objetivo del Pomodoro.</p>
            <Button variant="primary" className="mt-4" onClick={() => setModule('tasks', { enabled: true })}>
              Activar Tareas
            </Button>
          </div>
        ))}
      {tab === 'stats' && <StatsTab history={data.history} />}
      {tab === 'options' && <OptionsTab settings={settings} set={set} />}
    </div>
  )
}

function TimerTab({ state, settings, tasks, habits, set }) {
  const d = settings.durations
  const setDuration = (phase, v) => set({ durations: { [phase]: v } })
  const primary = state.running ? 'Pausar' : state.started ? 'Reanudar' : 'Iniciar foco'
  const isBreak = state.phase !== 'work'

  return (
    <>
      <Group title="Sesión actual">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: isBreak ? 'var(--break)' : 'var(--accent)' }}>
              {PHASE_LABELS[state.phase]}
            </p>
            <p className="tnum text-[28px] font-semibold leading-tight tracking-tight">{formatTime(state.secondsLeft)}</p>
          </div>
          <Button variant="primary" onClick={pomodoro.toggle}>
            {primary}
          </Button>
          <Button onClick={pomodoro.reset} disabled={!state.started}>
            Reiniciar
          </Button>
          <Button onClick={pomodoro.skip}>Saltar fase</Button>
        </div>
        <Row
          label="Objetivo de la sesión"
          htmlFor="pomo-task"
          hint={habits.length ? 'Si eliges un hábito de duración, al terminar el foco se le suman sus minutos.' : undefined}
        >
          <Select
            id="pomo-task"
            label="Objetivo de la sesión"
            value={state.currentTaskId ?? ''}
            onChange={(v) => pomodoro.selectTask(v || null)}
            options={[
              { value: '', label: 'Sin objetivo' },
              ...tasks.map((t) => ({ value: t.id, label: t.done ? `Tarea: ${t.title} (hecha)` : `Tarea: ${t.title}`, disabled: t.done })),
              ...habits.map((h) => ({ value: `habit:${h.id}`, label: `Hábito: ${h.icon} ${h.name}` }))
            ]}
          />
        </Row>
      </Group>

      <Group title="Duraciones" footer="Los cambios se aplican a la siguiente sesión que empiece.">
        <Row label="Foco">
          <Stepper label="minutos de foco" value={d.work} min={1} max={120} suffix=" min" onChange={(v) => setDuration('work', v)} />
        </Row>
        <Row label="Descanso corto">
          <Stepper label="minutos de descanso corto" value={d.short} min={1} max={60} suffix=" min" onChange={(v) => setDuration('short', v)} />
        </Row>
        <Row label="Descanso largo">
          <Stepper label="minutos de descanso largo" value={d.long} min={1} max={60} suffix=" min" onChange={(v) => setDuration('long', v)} />
        </Row>
        <Row label="Focos antes del descanso largo">
          <Stepper
            label="focos por ciclo"
            value={settings.longBreakInterval}
            min={1}
            max={8}
            onChange={(v) => set({ longBreakInterval: v })}
          />
        </Row>
      </Group>
    </>
  )
}

function StatsTab({ history }) {
  const today = useMemo(() => history.filter((h) => h.mode === 'work' && isToday(h.completedAt)), [history])
  const minutes = Math.round(today.reduce((a, h) => a + (h.durationSec ?? 0), 0) / 60)
  const week = useMemo(() => countByDay(history, lastNDays(7)), [history])
  const streak = useMemo(() => currentStreak(history), [history])

  const tile = (value, label) => (
    <div className="rounded-xl bg-group px-4 py-3">
      <p className="tnum text-[24px] font-semibold leading-tight">{value}</p>
      <p className="text-[12px] text-fg-3">{label}</p>
    </div>
  )

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {tile(today.length, today.length === 1 ? 'foco hoy' : 'focos hoy')}
        {tile(`${minutes} min`, 'de foco hoy')}
        {tile(streak, streak === 1 ? 'día seguido' : 'días seguidos')}
      </div>
      <Group title="Últimos 7 días">
        <div className="px-3 pb-2 pt-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={week} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--fg-3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--track)' }}
                formatter={(v) => [v, 'Focos']}
                contentStyle={{ background: 'var(--group-bg)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Group>
      {history.length > 0 && (
        <Button
          variant="plain"
          className="-mt-3 mb-6"
          onClick={() => {
            if (confirm('¿Borrar todo el historial de focos? Esta acción no se puede deshacer.')) pomodoro.clearHistory()
          }}
        >
          Borrar historial
        </Button>
      )}
    </>
  )
}

function OptionsTab({ settings, set }) {
  return (
    <Group title="Al terminar una fase">
      <Row label="Empezar el descanso automáticamente">
        <Switch label="Empezar el descanso automáticamente" checked={settings.autoStartNext} onChange={(v) => set({ autoStartNext: v })} />
      </Row>
      <Row label="Sonido">
        <Switch label="Sonido" checked={settings.soundEnabled} onChange={(v) => set({ soundEnabled: v })} />
      </Row>
      <Row label="Notificación del sistema">
        <Switch label="Notificación del sistema" checked={settings.notificationsEnabled} onChange={(v) => set({ notificationsEnabled: v })} />
      </Row>
    </Group>
  )
}
