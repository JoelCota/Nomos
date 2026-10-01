// One frameless, transparent window per enabled module.
import { BrowserWindow, screen } from 'electron'
import { MANIFESTS, getManifest } from '../modules/manifests.js'
import { WIDGET_PAD, widgetWindowSize } from '../shared/config.js'
import { baseWebPreferences, loadView } from './views.js'

const SNAP_THRESHOLD = 60
const VISUAL_GAP = 12 // space between stacked cards
const VISUAL_EDGE = 16 // space between a card and the screen edge (default placement)

export function createWidgetManager({ getConfig, savePosition, onContextMenu, onCloseRequest, isQuitting, log }) {
  const windows = new Map() // moduleId -> BrowserWindow
  const alive = (w) => w && !w.isDestroyed()

  // True when enough of the rectangle is on a connected display.
  function isOnScreen(b) {
    if (!b || [b.x, b.y, b.width, b.height].some((v) => typeof v !== 'number')) return false
    return screen.getAllDisplays().some(({ workArea: w }) => {
      const ox = Math.min(b.x + b.width, w.x + w.width) - Math.max(b.x, w.x)
      const oy = Math.min(b.y + b.height, w.y + w.height) - Math.max(b.y, w.y)
      return ox >= 60 && oy >= 60
    })
  }

  // First free spot for a new widget: columns from the bottom-right corner,
  // filled bottom-up, without covering any widget already on screen.
  function freeSpot(width, height) {
    const wa = screen.getPrimaryDisplay().workArea
    const edge = VISUAL_EDGE - WIDGET_PAD
    const card = (b) => ({ x: b.x + WIDGET_PAD, y: b.y + WIDGET_PAD, w: b.width - 2 * WIDGET_PAD, h: b.height - 2 * WIDGET_PAD })
    const taken = [...windows.values()].filter(alive).map((w) => card(w.getBounds()))
    const clash = (r) =>
      taken.some(
        (o) =>
          r.x < o.x + o.w + VISUAL_GAP && o.x < r.x + r.w + VISUAL_GAP && r.y < o.y + o.h + VISUAL_GAP && o.y < r.y + r.h + VISUAL_GAP
      )
    for (let col = 0; col < 4; col++) {
      const x = wa.x + wa.width - edge - width - col * (width - 2 * WIDGET_PAD + VISUAL_GAP)
      if (x < wa.x) break
      for (let y = wa.y + wa.height - edge - height; y >= wa.y; y -= 4) {
        if (!clash(card({ x, y, width, height }))) return { x, y }
      }
    }
    return { x: wa.x + edge, y: wa.y + edge }
  }

  function cornerTarget(bounds, corner) {
    const { x, y, width, height } = screen.getDisplayMatching(bounds).workArea
    const targets = {
      'top-left': { x, y },
      'top-right': { x: x + width - bounds.width, y },
      'bottom-left': { x, y: y + height - bounds.height },
      'bottom-right': { x: x + width - bounds.width, y: y + height - bounds.height }
    }
    return targets[corner] ?? null
  }

  function clampToWorkArea(b) {
    const wa = screen.getDisplayMatching(b).workArea
    const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)
    return { ...b, x, y }
  }

  function setBounds(id, b) {
    const win = windows.get(id)
    if (!alive(win)) return
    win.setBounds(b)
    // Windows can drop the opacity of transparent windows after a resize.
    win.setOpacity(getConfig().modules[id].widget.opacity)
  }

  function snapTo(id) {
    const win = windows.get(id)
    const corner = getConfig().modules[id]?.widget.snapCorner
    if (!alive(win) || !corner) return
    const b = win.getBounds()
    const t = cornerTarget(b, corner)
    if (t) setBounds(id, { ...b, ...t })
  }

  function maybeSnap(id) {
    const win = windows.get(id)
    const corner = getConfig().modules[id]?.widget.snapCorner
    if (!alive(win) || !corner) return
    const b = win.getBounds()
    const t = cornerTarget(b, corner)
    if (t && Math.hypot(b.x - t.x, b.y - t.y) <= SNAP_THRESHOLD) setBounds(id, { ...b, ...t })
  }

  const moveTimers = new Map()
  function persistPosition(id) {
    clearTimeout(moveTimers.get(id))
    moveTimers.set(
      id,
      setTimeout(() => {
        const win = windows.get(id)
        if (alive(win)) {
          const { x, y } = win.getBounds()
          savePosition(id, { x, y })
        }
      }, 400)
    )
  }

  function create(id, cfg) {
    const manifest = getManifest(id)
    const mod = cfg.modules[id]
    const [width, height] = widgetWindowSize(mod.widget.size)
    const saved = mod.widget.position
    const hasSaved = saved && isOnScreen({ ...saved, width, height })
    const pos = hasSaved ? saved : freeSpot(width, height)
    // Remember the automatic spot so the layout stays the same on the next launch.
    if (!hasSaved) savePosition(id, { x: Math.round(pos.x), y: Math.round(pos.y) })

    const win = new BrowserWindow({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width,
      height,
      title: manifest.name,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false, // the card draws its own shadow
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: mod.widget.layer === 'top',
      webPreferences: baseWebPreferences()
    })
    win.__ready = false

    win.once('ready-to-show', () => {
      win.__ready = true
      apply(id, getConfig())
    })
    win.on('close', (e) => {
      if (isQuitting()) return
      e.preventDefault()
      onCloseRequest(id) // Alt+F4 on a widget hides it
    })
    win.on('moved', () => {
      maybeSnap(id)
      persistPosition(id)
    })
    // Right-click on the draggable area (Windows): show our menu instead of the system one.
    win.on('system-context-menu', (e) => {
      e.preventDefault()
      onContextMenu(id)
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => log(`[widget:${id}] did-fail-load`, code, desc))

    windows.set(id, win)
    loadView(win, { view: 'widget', module: id })
    return win
  }

  // Bring an existing window in line with the config.
  function apply(id, cfg) {
    const win = windows.get(id)
    if (!alive(win)) return
    const { widget } = cfg.modules[id]

    const [w, h] = widgetWindowSize(widget.size)
    const b = win.getBounds()
    if (b.width !== w || b.height !== h) {
      // Keep the top-left corner in place (or the snapped corner), then stay on screen.
      let next = { x: b.x, y: b.y, width: w, height: h }
      const t = widget.snapCorner ? cornerTarget(next, widget.snapCorner) : null
      next = t ? { ...next, ...t } : clampToWorkArea(next)
      setBounds(id, next)
    }

    const onTop = widget.layer === 'top'
    if (win.isAlwaysOnTop() !== onTop) win.setAlwaysOnTop(onTop, 'screen-saver')
    if (onTop) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    win.setOpacity(widget.opacity)
    win.setIgnoreMouseEvents(!!cfg.general.clickThrough, { forward: true })

    if (!win.__ready) return
    if (widget.visible && !win.isVisible()) win.showInactive()
    else if (!widget.visible && win.isVisible()) win.hide()
  }

  function destroy(id) {
    const win = windows.get(id)
    windows.delete(id)
    if (alive(win)) win.destroy()
  }

  return {
    // Create, update or destroy windows so they match the config.
    sync(cfg) {
      // Reverse order so the last module gets the bottom-right corner when placed automatically.
      for (const m of [...MANIFESTS].reverse()) {
        if (cfg.modules[m.id].enabled) {
          if (!alive(windows.get(m.id))) create(m.id, cfg)
          apply(m.id, cfg)
        } else {
          destroy(m.id)
        }
      }
    },
    snapTo,
    get: (id) => (alive(windows.get(id)) ? windows.get(id) : null),
    idFor(webContents) {
      for (const [id, win] of windows) if (alive(win) && win.webContents === webContents) return id
      return null
    },
    all: () => [...windows.values()].filter(alive),
    destroyAll() {
      for (const id of [...windows.keys()]) destroy(id)
    }
  }
}
