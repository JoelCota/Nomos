// Notification cards in the style of the widgets. Each card is its own small
// transparent window, stacked in the top-right corner (newest on top). Cards
// close by themselves after `durationMs` (paused while the mouse is over them);
// beyond MAX_VISIBLE they wait in a queue.
import { BrowserWindow, screen } from 'electron'
import { baseWebPreferences, loadView } from './views.js'

export const TOAST_CARD = { width: 340, height: 136 }
const PAD = 12 // transparent margin for the card shadow (same as widgets)
const GAP = 10
const EDGE = 16
const MAX_VISIBLE = 4
const EXIT_MS = 220

export function createToastManager({ log, durationMs = 10000 }) {
  const visible = [] // newest first
  const queue = []
  let seq = 0
  const alive = (w) => w && !w.isDestroyed()
  const winW = TOAST_CARD.width + PAD * 2
  const winH = TOAST_CARD.height + PAD * 2

  function position(i) {
    const wa = screen.getPrimaryDisplay().workArea
    return {
      x: Math.round(wa.x + wa.width - winW - (EDGE - PAD)),
      y: Math.round(wa.y + (EDGE - PAD) + i * (TOAST_CARD.height + GAP))
    }
  }

  function layout() {
    visible.forEach((t, i) => {
      if (!alive(t.win)) return
      const p = position(i)
      t.win.setPosition(p.x, p.y)
    })
  }

  function startTimer(t, ms = durationMs) {
    clearTimeout(t.timer)
    t.startedAt = Date.now()
    t.remaining = ms
    t.timer = setTimeout(() => close(t.id, 'timeout'), ms)
  }

  function open(t) {
    visible.unshift(t)
    const p = position(0)
    const win = new BrowserWindow({
      x: p.x,
      y: p.y,
      width: winW,
      height: winH,
      title: t.payload.title ?? 'Aviso',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false, // never steal focus from what you are doing
      alwaysOnTop: true,
      show: false,
      webPreferences: baseWebPreferences()
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    t.win = win
    win.once('ready-to-show', () => {
      if (!alive(win)) return
      win.showInactive()
      startTimer(t)
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => log('[toast] did-fail-load', code, desc))
    loadView(win, { view: 'toast', id: t.id })
    layout()
  }

  function close(id, reason = 'dismiss') {
    const i = visible.findIndex((t) => t.id === id)
    if (i < 0) return
    const [t] = visible.splice(i, 1)
    clearTimeout(t.timer)
    if (reason !== 'action') t.onClose?.(reason)
    if (alive(t.win)) {
      t.win.webContents.send('toast:closing')
      setTimeout(() => alive(t.win) && t.win.destroy(), EXIT_MS)
    }
    layout()
    if (queue.length && visible.length < MAX_VISIBLE) open(queue.shift())
  }

  const byWebContents = (wc) => visible.find((t) => alive(t.win) && t.win.webContents === wc) ?? null

  return {
    // payload: { module, appName, icon, title, body, time, actions: [{ id, label, primary }], sound }
    show(payload, onAction, onClose) {
      const t = { id: `toast-${++seq}`, payload, onAction, onClose }
      if (visible.length >= MAX_VISIBLE) queue.push(t)
      else open(t)
      return t.id
    },
    close,
    payloadFor: (wc) => {
      const t = byWebContents(wc)
      return t ? { id: t.id, ...t.payload } : null
    },
    action(wc, actionId) {
      const t = byWebContents(wc)
      if (!t) return
      try {
        t.onAction?.(actionId)
      } catch (err) {
        log('[toast] action failed', String(err))
      }
      close(t.id, 'action')
    },
    dismiss(wc) {
      const t = byWebContents(wc)
      if (t) close(t.id, 'dismiss')
    },
    // Pause the countdown while the mouse is over the card.
    hover(wc, on) {
      const t = byWebContents(wc)
      if (!t) return
      if (on) {
        clearTimeout(t.timer)
        t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt))
      } else {
        startTimer(t, Math.max(2500, t.remaining))
      }
    },
    windows: () => visible.map((t) => t.win).filter(alive),
    count: () => visible.length,
    queued: () => queue.length,
    closeAll() {
      queue.length = 0
      for (const t of [...visible]) close(t.id, 'dismiss')
    }
  }
}
