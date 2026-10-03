// Pure data: imported by both the main process and the renderer.
export default {
  id: 'tasks',
  name: 'Tareas',
  description: 'Lista de tareas pendientes. El Pomodoro puede usarlas como objetivo de sus focos.',
  icon: '📋',
  sizes: ['small', 'medium', 'large'],
  defaultEnabled: true,
  defaultSettings: {
    showCompleted: true // keep completed tasks (struck through) in the widget list
  },
  defaultWidget: { size: 'medium', layer: 'top' }
}
