// One frameless, transparent window per enabled module whose widget is visible.
// Hidden widgets have no window at all (their module keeps working in the main
// process), so they cost no memory. Windows are opened through `openWindow`,
// which puts them all in one shared renderer process (see host.js).
import { screen } from 'electron'
import { MANIFESTS, getManifest } from '../modules/manifests.js'
import { WIDGET_PAD, glassActive, widgetPad, widgetWindowSize } from '../shared/config.js'
import { applyGlass, desktopHandle, sendToBack, setDesktopOwner, supports } from './native.js'

const SNAP_THRESHOLD = 60
const VISUAL_GAP = 12 // space between stacked cards
const VISUAL_EDGE = 16 // space between a card and the screen edge (default placement)

export function createWidgetManager({ getConfig, openWindow, savePosition, onContextMenu, onCloseRequest, isQuitting, isDark, log }) {
  const windows = new Map() // moduleId -> BrowserWindow
  const creating = new Set() // moduleIds whose window is being opened
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
  function freeSpot(width, height, pad, cfg, selfId) {
    const wa = screen.getPrimaryDisplay().workArea
    const edge = VISUAL_EDGE - pad
    const card = (b) => ({ x: b.x + pad, y: b.y + pad, w: b.width - 2 * pad, h: b.height - 2 * pad })
    const taken = [...windows.values()].filter(alive).map((w) => card(w.getBounds()))
    // Hidden widgets have no window but keep their place.
    for (const m of MANIFESTS) {
      const mod = cfg.modules[m.id]
      if (m.id === selfId || !mod.enabled || alive(windows.get(m.id)) || !mod.widget.position) continue
      const [w, h] = widgetWindowSize(mod.widget.size, pad)
      taken.push(card({ ...mod.widget.position, width: w, height: h }))
    }
    const clash = (r) =>
      taken.some(
        (o) =>
          r.x < o.x + o.w + VISUAL_GAP && o.x < r.x + r.w + VISUAL_GAP && r.y < o.y + o.h + VISUAL_GAP && o.y < r.y + r.h + VISUAL_GAP
      )
    for (let col = 0; col < 4; col++) {
      const x = wa.x + wa.width - edge - width - col * (width - 2 * pad + VISUAL_GAP)
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
    const pad = widgetPad(cfg)
    const [width, height] = widgetWindowSize(mod.widget.size, pad)
    const saved = mod.widget.position
    const hasSaved = saved && isOnScreen({ ...saved, width, height })
    const pos = hasSaved ? saved : freeSpot(width, height, pad, cfg, id)
    // Remember the automatic spot so the layout stays the same on the next launch.
    if (!hasSaved) savePosition(id, { x: Math.round(pos.x), y: Math.round(pos.y) })

    const options = {
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
      alwaysOnTop: mod.widget.layer === 'top'
    }
    creating.add(id)
    openWindow(options, { view: 'widget', module: id })
      .then((win) => {
        creating.delete(id)
        const now = getConfig().modules[id]
        // The module was disabled or hidden while the window was opening.
        if (!now?.enabled || !now.widget.visible || alive(windows.get(id))) {
          win.destroy()
          return
        }
        setup(id, win, glassActive(cfg))
      })
      .catch((err) => {
        creating.delete(id)
        log(`[widget:${id}] could not open: ${String(err)}`)
      })
  }

  function setup(id, win, glass) {
    win.__ready = false
    win.__glass = glass
    const markReady = () => {
      if (win.__ready || !alive(win)) return
      win.__ready = true
      if (win.__glass && !applyGlass(win, isDark())) log(`[widget:${id}] glass backdrop could not be applied`)
      apply(id, getConfig())
    }
    win.once('ready-to-show', markReady)
    // Safety net in case the first paint happened before we started listening.
    win.webContents.once('did-finish-load', () => setTimeout(markReady, 300))
    // Widgets "al fondo" go back behind other windows whenever they are shown or clicked.
    win.on('show', () => win.__pinned && sendToBack(win))
    win.on('focus', () => win.__pinned && setTimeout(() => alive(win) && sendToBack(win), 0))
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
    apply(id, getConfig())
  }

  // Bring an existing window in line with the config.
  function apply(id, cfg) {
    const win = windows.get(id)
    if (!alive(win)) return
    const { widget } = cfg.modules[id]

    const [w, h] = widgetWindowSize(widget.size, widgetPad(cfg))
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

    // "Al fondo" on Windows: owned by the desktop, not focusable, sent to the back.
    // Elsewhere it is simply a normal (not always-on-top) window.
    const pin = widget.layer === 'bottom' && supports.desktopLayer()
    if (pin !== !!win.__pinned) {
      if (pin) {
        win.__pinned = setDesktopOwner(win, true)
        if (win.__pinned) win.setFocusable(false)
      } else {
        setDesktopOwner(win, false)
        win.setFocusable(true)
        win.__pinned = false
      }
    }

    win.setOpacity(widget.opacity)
    win.setIgnoreMouseEvents(!!cfg.general.clickThrough, { forward: true })

    if (!win.__ready) return
    if (!win.isVisible()) win.showInactive()
    if (win.__pinned) sendToBack(win)
  }

  // If Explorer restarts, the desktop window changes: pin the widgets again.
  let lastDesktop = 0
  setInterval(() => {
    if (!supports.desktopLayer()) return
    const current = desktopHandle()
    if (current && current !== lastDesktop) {
      const changed = lastDesktop !== 0
      lastDesktop = current
      if (changed) for (const win of windows.values()) if (alive(win) && win.__pinned) setDesktopOwner(win, true)
    }
  }, 30 * 1000)

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
        const mod = cfg.modules[m.id]
        if (mod.enabled && mod.widget.visible) {
          if (alive(windows.get(m.id))) apply(m.id, cfg)
          else if (!creating.has(m.id)) create(m.id, cfg)
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
