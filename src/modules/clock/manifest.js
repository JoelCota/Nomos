// Pure data: imported by both the main process and the renderer.
export default {
  id: 'clock',
  name: 'Reloj',
  description: 'Reloj flip con la fecha del día.',
  icon: '🕐',
  sizes: ['small', 'medium', 'large'],
  defaultEnabled: true,
  defaultSettings: {
    clockFormat: 'auto', // 'auto' | '12' | '24'
    style: 'flip' // 'flip' ('analog' arrives in phase 4)
  },
  defaultWidget: { size: 'medium', layer: 'bottom' }
}
