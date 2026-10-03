// UI of each module: the widget and its page in the Control Panel.
import ClockWidget from './clock/renderer/ClockWidget'
import ClockPanel from './clock/renderer/ClockPanel'
import PomodoroWidget from './pomodoro/renderer/PomodoroWidget'
import PomodoroPanel from './pomodoro/renderer/PomodoroPanel'
import TasksWidget from './tasks/renderer/TasksWidget'
import TasksPanel from './tasks/renderer/TasksPanel'
import HabitsWidget from './habits/renderer/HabitsWidget'
import HabitsPanel from './habits/renderer/HabitsPanel'

export const RENDERERS = {
  clock: { Widget: ClockWidget, Panel: ClockPanel },
  pomodoro: { Widget: PomodoroWidget, Panel: PomodoroPanel },
  tasks: { Widget: TasksWidget, Panel: TasksPanel },
  habits: { Widget: HabitsWidget, Panel: HabitsPanel }
}
