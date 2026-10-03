import { setModuleSettings } from '../../../renderer/src/lib/ipc'
import { Group, Row, Switch } from '../../../renderer/src/ui/controls'
import { usePomodoroState } from '../../pomodoro/renderer/usePomodoro'
import TasksList from './TasksList'
import { useTasksData } from './useTasks'

export default function TasksPanel({ settings, config }) {
  const data = useTasksData()
  // Which task the Pomodoro is working on (only while that module is on).
  const pomodoro = usePomodoroState()
  const currentTaskId = config?.modules.pomodoro?.enabled ? pomodoro?.currentTaskId : null

  return (
    <>
      <TasksList tasks={data?.tasks ?? []} currentTaskId={currentTaskId} />
      <Group title="Widget" footer="Con el módulo Pomodoro activo, cada tarea del widget tiene un botón para empezar a trabajar en ella.">
        <Row label="Mostrar tareas completadas">
          <Switch
            label="Mostrar tareas completadas"
            checked={settings.showCompleted !== false}
            onChange={(v) => setModuleSettings('tasks', { showCompleted: v })}
          />
        </Row>
      </Group>
    </>
  )
}
