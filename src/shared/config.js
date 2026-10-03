// App configuration schema (v2): general settings + one entry per module.
//
// {
//   general: { theme, accent, launchAtLogin, clickThrough },
//   modules: { <id>: { enabled, settings: {...}, widget: { visible, size, layer, snapCorner, opacity, position } } }
// }
//
// Module data (tasks, history, habits...) lives separately under `data.<id>` in the store.
// Schema v3: the tasks moved from `data.pomodoro.tasks` to `data.tasks.items` (their own module).
import { mergeDeep } from './merge.js'

export const SCHEMA_VERSION = 3

// Card sizes in px, modelled on macOS widget families (small / medium / large).
export const CARD_SIZES = {
  small: [164, 164],
  medium: [344, 164],
  large: [344, 344]
}
// Transparent margin around the card so its CSS shadow isn't clipped.
export const WIDGET_PAD = 12

// In glass mode (Windows 11) the window *is* the card, so there is no margin.
export const widgetWindowSize = (size, pad = WIDGET_PAD) => {
  const [w, h] = CARD_SIZES[size] ?? CARD_SIZES.medium
  return [w + pad * 2, h + pad * 2]
}

export const glassActive = (cfg) => !!(cfg?.general?.glass && cfg?.runtime?.glass)
export const widgetPad = (cfg) => (glassActive(cfg) ? 0 : WIDGET_PAD)

export const SIZE_LABELS = { small: 'Pequeño', medium: 'Mediano', large: 'Grande' }

// layer: 'top' = always on top · 'bottom' = on the desktop (full behaviour arrives in phase 4)
export const LAYER_LABELS = { top: 'Siempre encima', bottom: 'Al fondo' }

export const GENERAL_DEFAULTS = {
  theme: 'system', // 'system' | 'dark' | 'light'
  accent: '#f97316',
  launchAtLogin: false,
  clickThrough: false,
  glass: false // experimental acrylic background (Windows 11 22H2+)
}

export const WIDGET_DEFAULTS = {
  visible: true,
  size: 'medium',
  layer: 'top',
  snapCorner: null,
  opacity: 1,
  position: null // { x, y } of the window; null = automatic placement
}

// Build a complete config from whatever is stored, filling every missing key
// with the defaults of the general section and of each module manifest.
export function buildConfig(stored, manifests) {
  const s = stored ?? {}
  const modules = {}
  for (const m of manifests) {
    const sm = s.modules?.[m.id] ?? {}
    const widget = mergeDeep({ ...WIDGET_DEFAULTS, ...(m.defaultWidget ?? {}) }, sm.widget)
    if (!m.sizes.includes(widget.size)) widget.size = m.defaultWidget?.size ?? m.sizes[0]
    if (!(widget.layer in LAYER_LABELS)) widget.layer = WIDGET_DEFAULTS.layer
    modules[m.id] = {
      enabled: typeof sm.enabled === 'boolean' ? sm.enabled : m.defaultEnabled !== false,
      settings: mergeDeep(m.defaultSettings ?? {}, sm.settings),
      widget
    }
  }
  return { general: mergeDeep(GENERAL_DEFAULTS, s.general), modules }
}

// ---- Migration from the single-window app (schema v1) ----

const V1_DEFAULTS = {
  durations: { work: 25, short: 5, long: 15 },
  longBreakInterval: 4,
  autoStartNext: true,
  soundEnabled: true,
  notificationsEnabled: true,
  theme: 'dark',
  accent: '#f97316',
  opacity: 1,
  widgetSize: 'medium',
  clickThrough: false,
  snapCorner: null,
  launchAtLogin: false,
  alwaysOnTop: true,
  flipClock: true,
  clockFormat: 'auto'
}

export function migrateV1({ settings, tasks, history, windowBounds } = {}) {
  const s = { ...V1_DEFAULTS, ...(settings ?? {}) }
  s.durations = { ...V1_DEFAULTS.durations, ...(settings?.durations ?? {}) }
  const layer = s.alwaysOnTop === false ? 'bottom' : 'top'
  const opacity = typeof s.opacity === 'number' && s.opacity > 0 && s.opacity <= 1 ? s.opacity : 1
  const hasBounds = windowBounds && typeof windowBounds.x === 'number' && typeof windowBounds.y === 'number'
  const [, clockH] = widgetWindowSize('medium')

  return {
    general: {
      theme: s.theme === 'light' ? 'light' : 'dark',
      accent: s.accent,
      launchAtLogin: !!s.launchAtLogin,
      clickThrough: !!s.clickThrough
    },
    modules: {
      clock: {
        // The old widget showed the clock unless "Show flip clock" was off.
        enabled: s.flipClock !== false,
        settings: { clockFormat: s.clockFormat ?? 'auto', style: 'flip' },
        widget: {
          visible: true,
          size: 'medium',
          layer,
          snapCorner: null,
          opacity,
          position: hasBounds ? { x: windowBounds.x, y: windowBounds.y - clockH } : null
        }
      },
      pomodoro: {
        enabled: true,
        settings: {
          durations: s.durations,
          longBreakInterval: s.longBreakInterval,
          autoStartNext: s.autoStartNext,
          soundEnabled: s.soundEnabled,
          notificationsEnabled: s.notificationsEnabled
        },
        widget: {
          visible: true,
          size: 'medium',
          layer,
          snapCorner: s.snapCorner ?? null,
          opacity,
          position: hasBounds ? { x: windowBounds.x, y: windowBounds.y } : null
        }
      }
    },
    data: {
      tasks: { items: Array.isArray(tasks) ? tasks : [] },
      pomodoro: { history: Array.isArray(history) ? history : [] }
    }
  }
}
