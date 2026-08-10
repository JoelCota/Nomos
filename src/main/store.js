import Store from 'electron-store'

export const DEFAULT_SETTINGS = {
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

const store = new Store({
  name: 'pomodoro-widget',
  defaults: {
    settings: DEFAULT_SETTINGS,
    tasks: [],
    history: [],
    windowBounds: null
  }
})

export const getSettings = () => store.get('settings')
export const setSettings = (patch) => {
  store.set('settings', { ...getSettings(), ...patch })
  return getSettings()
}

export const getTasks = () => store.get('tasks')
export const setTasks = (tasks) => store.set('tasks', tasks)

export const getHistory = () => store.get('history')
export const setHistory = (history) => store.set('history', history)

export const getWindowBounds = () => store.get('windowBounds')
export const setWindowBounds = (bounds) => store.set('windowBounds', bounds)
