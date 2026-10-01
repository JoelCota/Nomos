import { join } from 'path'
import { pathToFileURL } from 'url'

// NOMOS_TEST=1 runs the self-test (POMODORO_TEST=1, the old name, still works).
export const IS_TEST = process.env.NOMOS_TEST === '1' || process.env.POMODORO_TEST === '1'
export const TOAST_MS = Number(process.env.NOMOS_TOAST_MS || process.env.POMODORO_TOAST_MS) || 10000

export const preloadPath = () => join(import.meta.dirname, '../preload/index.js')

export const baseWebPreferences = () => ({
  preload: preloadPath(),
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false,
  additionalArguments: IS_TEST ? ['--nomos-test'] : []
})

// URL of the renderer for a given view (used by window.open in the shared process).
export function viewUrl(query) {
  const params = new URLSearchParams(query).toString()
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    return url.toString()
  }
  return `${pathToFileURL(join(import.meta.dirname, '../renderer/index.html')).href}?${params}`
}

// All windows load the same renderer; `query` picks the view
// (view=widget&module=<id>  or  view=panel&page=<page>).
export function loadView(win, query) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    return win.loadURL(url.toString())
  }
  return win.loadFile(join(import.meta.dirname, '../renderer/index.html'), { query })
}
