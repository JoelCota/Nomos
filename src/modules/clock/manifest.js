// Pure data: imported by both the main process and the renderer.
export default {
  id: 'clock',
  name: 'Reloj',
  description: 'Reloj flip o analógico, con la fecha y otras ciudades.',
  icon: '🕐',
  sizes: ['small', 'medium', 'large'],
  defaultEnabled: true,
  defaultSettings: {
    clockFormat: 'auto', // 'auto' | '12' | '24' (flip style)
    style: 'flip', // 'flip' | 'analog'
    showSeconds: true, // analog second hand
    worldClocks: [] // [{ city, tz }] shown in the large size, up to 3
  },
  defaultWidget: { size: 'medium', layer: 'bottom' }
}
