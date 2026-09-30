// Pure data: imported by both the main process and the renderer.
export default {
  id: 'habits',
  name: 'Hábitos',
  description: 'Hábitos diarios o semanales con rachas y progreso del día.',
  icon: '✅',
  sizes: ['small', 'medium', 'large'],
  defaultEnabled: true,
  defaultSettings: {
    dayStartHour: 0, // a new day starts at this hour (0 = midnight)
    showCompleted: true, // keep completed habits in the widget list
    remindersEnabled: true,
    reminderSound: true,
    summaryEnabled: true, // evening summary of pending habits
    summaryTime: '20:30'
  },
  defaultWidget: { size: 'medium', layer: 'bottom' }
}
