// Shared renderer process for widgets and notification cards.
//
// Every BrowserWindow normally gets its own Chromium renderer process (~30 MB
// each). Instead, a hidden "host" window opens the widget and card windows with
// window.open(): Chromium keeps them in the host's process, so each extra widget
// only costs a few MB. The host also plays sounds, so they work even when no
// widget is visible.
//
// If window.open fails for any reason, `open()` falls back to a normal,
// separate BrowserWindow, so nothing breaks.
import { BrowserWindow } from 'electron'
import { baseWebPreferences, loadView, viewUrl } from './views.js'

const OPEN_TIMEOUT_MS = 8000

export function createWindowHost({ log, onCrash, separate = false }) {
  let host = null
  let ready = null
  let seq = 0
  let useFallback = separate
  const pending = new Map() // frameName -> { options, resolve, reject, timer }
  const alive = () => host && !host.isDestroyed()

  function ensureHost() {
    if (alive()) return ready
    host = new BrowserWindow({ show: false, width: 120, height: 80, skipTaskbar: true, webPreferences: baseWebPreferences() })
    host.webContents.setWindowOpenHandler(({ frameName }) => {
      const p = pending.get(frameName)
      if (!p) return { action: 'deny' }
      // webPreferences must be passed again or the child window gets no preload.
      return { action: 'allow', overrideBrowserWindowOptions: { ...p.options, webPreferences: baseWebPreferences() } }
    })
    host.webContents.on('did-create-window', (win, { frameName }) => {
      const p = pending.get(frameName)
      if (!p) return
      pending.delete(frameName)
      clearTimeout(p.timer)
      p.resolve(win)
    })
    host.webContents.on('render-process-gone', (_e, details) => {
      log(`[host] renderer gone: ${details?.reason}`)
      const crashed = host
      host = null
      ready = null
      if (crashed && !crashed.isDestroyed()) crashed.destroy()
      onCrash?.()
    })
    ready = loadView(host, { view: 'host' })
    return ready
  }

  function openSeparate(options, query) {
    const win = new BrowserWindow({ ...options, webPreferences: baseWebPreferences() })
    loadView(win, query)
    return Promise.resolve(win)
  }

  async function openShared(options, query) {
    await ensureHost()
    const name = `nomos-${++seq}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(name)
        reject(new Error('window.open timed out'))
      }, OPEN_TIMEOUT_MS)
      pending.set(name, { options, resolve, reject, timer })
      host.webContents
        .executeJavaScript(`!!window.open(${JSON.stringify(viewUrl(query))}, ${JSON.stringify(name)})`)
        .then((ok) => {
          if (ok === false && pending.has(name)) {
            pending.delete(name)
            clearTimeout(timer)
            reject(new Error('window.open returned null'))
          }
        })
        .catch((err) => {
          pending.delete(name)
          clearTimeout(timer)
          reject(err)
        })
    })
  }

  return {
    // Open a window for `query` (e.g. { view: 'widget', module: 'clock' }).
    async open(options, query) {
      if (useFallback) return openSeparate(options, query)
      try {
        return await openShared(options, query)
      } catch (err) {
        log(`[host] shared window failed (${String(err)}); using separate windows from now on`)
        useFallback = true
        return openSeparate(options, query)
      }
    },
    // Sounds are played by the host so they work with every widget hidden.
    playSound(kind = 'chime') {
      ensureHost()
      if (alive()) host.webContents.send('host:sound', kind)
    },
    start: () => ensureHost(),
    webContents: () => (alive() ? host.webContents : null),
    isShared: () => !useFallback,
    destroy() {
      if (alive()) host.destroy()
      host = null
    }
  }
}
