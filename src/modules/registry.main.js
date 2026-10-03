// Main-process services of modules that need background work.
// A module without an entry here only has a widget (e.g. the clock).
import createPomodoroService from './pomodoro/main.js'
import createTasksService from './tasks/main.js'
import createHabitsService from './habits/main.js'

export const SERVICES = {
  pomodoro: createPomodoroService,
  tasks: createTasksService,
  habits: createHabitsService
}
