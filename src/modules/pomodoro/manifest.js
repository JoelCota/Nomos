// Pure data: imported by both the main process and the renderer.
export default {
  id: 'pomodoro',
  name: 'Pomodoro',
  description: 'Temporizador de foco con descansos, tareas y estadísticas.',
  icon: '🍅',
  sizes: ['small', 'medium', 'large'],
  defaultEnabled: true,
  defaultSettings: {
    durations: { work: 25, short: 5, long: 15 },
    longBreakInterval: 4,
    autoStartNext: true,
    soundEnabled: true,
    notificationsEnabled: true
  },
  defaultWidget: { size: 'medium', layer: 'top' }
}
