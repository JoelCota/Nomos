import { app, BrowserWindow, Tray, Menu, ipcMain, Notification, globalShortcut, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { MANIFESTS, getManifest } from '../modules/manifests.js'
import { SERVICES } from '../modules/registry.main.js'
import { GENERAL_DEFAULTS, LAYER_LABELS, SIZE_LABELS, WIDGET_PAD, glassActive } from '../shared/config.js'
import { initNative, setGlassDarkMode, supports } from './native.js'
import { getConfig, setGeneral, setModule, getData, setData } from './store.js'
import { createWidgetManager } from './widgets.js'
import { createToastManager } from './toasts.js'
import { openPanel, getPanel } from './panel.js'
import { log, trimLog } from './log.js'
import { IS_TEST, TOAST_MS } from './views.js'

// ---------------------------------------------------------------------------
// Self-test runs against a fresh, isolated userData folder, seeded with data in
// the old (v1) format so the migration is exercised too.
if (IS_TEST) {
  const testDir = join(app.getPath('temp'), 'nomos-selftest')
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  mkdirSync(testDir, { recursive: true })
  app.setPath('userData', testDir)
  if (process.env.NOMOS_TEST_SEED !== '0') {
    // Seeded under the old file name so the rename adoption and the v1 migration are both exercised.
    writeFileSync(
      join(testDir, 'pomodoro-widget.json'),
      JSON.stringify({
        settings: { durations: { work: 30, short: 5, long: 15 }, theme: 'dark', opacity: 0.9, flipClock: true },
        tasks: [{ id: 'seed-task', title: 'Tarea migrada', done: false, pomodoros: 2, createdAt: new Date().toISOString() }],
        history: [],
        windowBounds: { x: 300, y: 400, width: 320, height: 141 }
      })
    )
  }
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const HEX = /^#[0-9a-f]{6}$/i

let config = null
let tray = null
let isQuitting = false
const services = new Map() // moduleId -> service instance
const moduleShortcuts = new Map() // moduleId -> [accelerators]

// ---------------------------------------------------------------------------
// Window messaging

const allWindows = () => {
  const list = [...widgets.all(), ...toasts.windows()]
  const panel = getPanel()
  if (panel) list.push(panel)
  return list
}
const sendToAll = (channel, payload) => {
  for (const w of allWindows()) w.webContents.send(channel, payload)
}

// ---------------------------------------------------------------------------
// Config pipeline: every change goes through commit(), which updates windows,
// module services, shortcuts, the tray and every renderer.

// The stored config plus what this computer supports (sent to every window).
const loadConfig = () => ({
  ...getConfig(),
  runtime: { platform: process.platform, desktopLayer: supports.desktopLayer(), glass: supports.glass() }
})

const isDark = () => {
  const t = config?.general.theme ?? 'system'
  return t === 'dark' || (t === 'system' && nativeTheme.shouldUseDarkColors)
}

function commit(prev) {
  config = loadConfig()

  // Switching the glass background changes how widget windows are built: keep
  // each card where it was (the transparent margin appears/disappears) and rebuild.
  if (prev && glassActive(prev) !== glassActive(config)) {
    const d = glassActive(config) ? WIDGET_PAD : -WIDGET_PAD
    for (const m of MANIFESTS) {
      const pos = config.modules[m.id].widget.position
      if (pos) setModule(m.id, { widget: { position: { x: pos.x + d, y: pos.y + d } } })
    }
    config = loadConfig()
    widgets.destroyAll()
  }
  if (prev && prev.general.theme !== config.general.theme) {
    for (const w of widgets.all()) setGlassDarkMode(w, isDark())
  }

  widgets.sync(config)

  for (const m of MANIFESTS) {
    const was = prev ? prev.modules[m.id].enabled : false
    const now = config.modules[m.id].enabled
    const svc = services.get(m.id)
    if (now && !was) {
      svc?.start()
      registerModuleShortcuts(m.id)
    } else if (!now && was) {
      svc?.stop()
      unregisterModuleShortcuts(m.id)
    } else if (now && svc && prev) {
      const a = JSON.stringify(prev.modules[m.id].settings)
      const b = JSON.stringify(config.modules[m.id].settings)
      if (a !== b) svc.onSettingsChanged(config.modules[m.id].settings, prev.modules[m.id].settings)
    }
  }

  if (prev && prev.general.launchAtLogin !== config.general.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: config.general.launchAtLogin })
  }
  sendToAll('config:changed', config)
  refreshTray()
}

function updateGeneral(patch) {
  const prev = config
  setGeneral(patch)
  commit(prev)
}

function updateModule(id, patch) {
  const prev = config
  setModule(id, patch)
  commit(prev)
  if (patch.widget?.snapCorner) widgets.snapTo(id)
}

const setWidget = (id, widgetPatch) => updateModule(id, { widget: widgetPatch })
const setModuleEnabled = (id, enabled) => updateModule(id, { enabled, widget: enabled ? { visible: true } : {} })

// Tray click / Alt+Shift+O: hide every visible widget, or show them all again.
function toggleAllWidgets() {
  const enabled = MANIFESTS.filter((m) => config.modules[m.id].enabled)
  if (!enabled.length) return
  const anyVisible = enabled.some((m) => config.modules[m.id].widget.visible)
  const prev = config
  for (const m of enabled) setModule(m.id, { widget: { visible: !anyVisible } })
  commit(prev)
}

// ---------------------------------------------------------------------------
// Input validation for patches coming from renderers

function cleanGeneral(p) {
  const out = {}
  if (!p || typeof p !== 'object') return out
  if (['system', 'dark', 'light'].includes(p.theme)) out.theme = p.theme
  if (typeof p.accent === 'string' && HEX.test(p.accent)) out.accent = p.accent
  for (const k of ['launchAtLogin', 'clickThrough', 'glass']) if (typeof p[k] === 'boolean') out[k] = p[k]
  return out
}

function cleanModulePatch(id, p) {
  const out = {}
  if (!p || typeof p !== 'object') return out
  if (typeof p.enabled === 'boolean') out.enabled = p.enabled
  if (p.settings && typeof p.settings === 'object') out.settings = p.settings
  if (p.widget && typeof p.widget === 'object') {
    const w = p.widget
    const ow = {}
    if (typeof w.visible === 'boolean') ow.visible = w.visible
    if (getManifest(id).sizes.includes(w.size)) ow.size = w.size
    if (w.layer in LAYER_LABELS) ow.layer = w.layer
    if (w.snapCorner === null || CORNERS.includes(w.snapCorner)) ow.snapCorner = w.snapCorner
    if (typeof w.opacity === 'number') ow.opacity = Math.min(1, Math.max(0.3, w.opacity))
    out.widget = ow
  }
  if (out.enabled === true) out.widget = { visible: true, ...(out.widget ?? {}) }
  return out
}

// ---------------------------------------------------------------------------
// Module services

function createServiceContext(id) {
  return {
    id,
    isTest: IS_TEST,
    log,
    getSettings: () => config.modules[id].settings,
    data: {
      get: (key, fallback) => getData(id, key, fallback),
      set: (key, value) => setData(id, key, value)
    },
    handle: (name, fn) => ipcMain.handle(`${id}:${name}`, (_e, ...args) => fn(...args)),
    broadcast: (event, payload) => sendToAll(`${id}:${event}`, payload),
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body, silent: true }).show()
    },
    refreshTray: () => refreshTray(),
    // Show a notification card; onAction(actionId) runs when a button is pressed.
    toast: (payload, onAction, onClose) => toasts.show({ module: id, ...payload }, onAction, onClose),
    openPanel: (page) => showPanel(page),
    // Another module's public API, or null when that module is disabled.
    getService: (other) => (config.modules[other]?.enabled ? services.get(other)?.api ?? null : null)
  }
}

function registerModuleShortcuts(id) {
  const svc = services.get(id)
  if (!svc?.shortcuts) return
  const registered = []
  for (const [accel, fn] of Object.entries(svc.shortcuts)) {
    if (globalShortcut.register(accel, fn)) registered.push(accel)
    else log(`[main] shortcut ${accel} (${id}) could not be registered`)
  }
  moduleShortcuts.set(id, registered)
}

function unregisterModuleShortcuts(id) {
  for (const accel of moduleShortcuts.get(id) ?? []) globalShortcut.unregister(accel)
  moduleShortcuts.delete(id)
}

// ---------------------------------------------------------------------------
// Widget context menu (right-click on a widget)

function showWidgetMenu(id) {
  const m = getManifest(id)
  const w = config.modules[id].widget
  const win = widgets.get(id)
  if (!m || !win) return
  const cornerLabels = {
    null: 'Ninguna',
    'top-left': 'Arriba a la izquierda',
    'top-right': 'Arriba a la derecha',
    'bottom-left': 'Abajo a la izquierda',
    'bottom-right': 'Abajo a la derecha'
  }
  Menu.buildFromTemplate([
    { label: `${m.icon}  ${m.name}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Tamaño',
      submenu: m.sizes.map((s) => ({
        label: SIZE_LABELS[s],
        type: 'radio',
        checked: w.size === s,
        click: () => setWidget(id, { size: s })
      }))
    },
    {
      label: 'Capa',
      submenu: Object.entries(LAYER_LABELS).map(([k, label]) => ({
        label,
        type: 'radio',
        checked: w.layer === k,
        click: () => setWidget(id, { layer: k })
      }))
    },
    {
      label: 'Anclar a esquina',
      submenu: [null, ...CORNERS].map((c) => ({
        label: cornerLabels[c],
        type: 'radio',
        checked: w.snapCorner === c,
        click: () => setWidget(id, { snapCorner: c })
      }))
    },
    { type: 'separator' },
    { label: `Ajustes de ${m.name}…`, click: () => showPanel(`module:${id}`) },
    { label: 'Panel de control…', click: () => showPanel('modules') },
    { type: 'separator' },
    { label: 'Ocultar widget', click: () => setWidget(id, { visible: false }) },
    { label: 'Desactivar módulo', click: () => setModuleEnabled(id, false) }
  ]).popup({ window: win })
}

const showPanel = (page) => openPanel(page, config?.general.theme ?? GENERAL_DEFAULTS.theme)

// ---------------------------------------------------------------------------
// Tray

const trayIconPath = () =>
  [join(process.resourcesPath, 'resources', 'tray.png'), join(app.getAppPath(), 'resources', 'tray.png')].find((p) =>
    existsSync(p)
  ) ?? null

let trayTimer = null
function refreshTray() {
  // Coalesce the many refreshes a running timer asks for.
  if (trayTimer) return
  trayTimer = setTimeout(() => {
    trayTimer = null
    buildTrayMenu()
  }, 30)
}

function buildTrayMenu() {
  if (!tray || !config) return
  const items = []
  const status = []
  for (const m of MANIFESTS) {
    const svc = services.get(m.id)
    if (!config.modules[m.id].enabled || !svc?.statusLabel) continue
    const label = svc.statusLabel()
    status.push(label)
    items.push({ label: `${m.icon}  ${label}`, enabled: false }, ...(svc.trayItems?.() ?? []), { type: 'separator' })
  }
  const enabled = MANIFESTS.filter((m) => config.modules[m.id].enabled)
  const anyVisible = enabled.some((m) => config.modules[m.id].widget.visible)
  items.push(
    { label: 'Panel de control…', click: () => showPanel('modules') },
    {
      label: 'Módulos',
      submenu: MANIFESTS.map((m) => ({
        label: `${m.icon}  ${m.name}`,
        type: 'checkbox',
        checked: config.modules[m.id].enabled,
        click: (item) => setModuleEnabled(m.id, item.checked)
      }))
    },
    { label: anyVisible ? 'Ocultar widgets' : 'Mostrar widgets', enabled: enabled.length > 0, click: toggleAllWidgets },
    {
      label: 'Click-through',
      type: 'checkbox',
      checked: config.general.clickThrough,
      click: (item) => updateGeneral({ clickThrough: item.checked })
    },
    { type: 'separator' },
    { label: 'Salir', click: () => quitApp() }
  )
  tray.setContextMenu(Menu.buildFromTemplate(items))
  tray.setToolTip(['Nomos', ...status].join('\n'))
}

function createTray() {
  const p = trayIconPath()
  tray = new Tray(p ? nativeImage.createFromPath(p) : nativeImage.createEmpty())
  tray.on('click', () => {
    if (process.platform !== 'darwin') toggleAllWidgets()
  })
  buildTrayMenu()
}

// ---------------------------------------------------------------------------
// IPC

function registerIpc() {
  ipcMain.handle('config:get', () => config)
  ipcMain.handle('config:set-general', (_e, patch) => {
    updateGeneral(cleanGeneral(patch))
    return config
  })
  ipcMain.handle('config:set-module', (_e, id, patch) => {
    if (!getManifest(id)) return config
    updateModule(id, cleanModulePatch(id, patch))
    return config
  })

  ipcMain.handle('widget:context-menu', (e) => {
    const id = widgets.idFor(e.sender)
    if (id) showWidgetMenu(id)
  })
  ipcMain.handle('widget:hide', (e) => {
    const id = widgets.idFor(e.sender)
    if (id) setWidget(id, { visible: false })
  })

  ipcMain.handle('toast:get', (e) => toasts.payloadFor(e.sender))
  ipcMain.handle('toast:action', (e, actionId) => toasts.action(e.sender, String(actionId)))
  ipcMain.handle('toast:dismiss', (e) => toasts.dismiss(e.sender))
  ipcMain.handle('toast:hover', (e, on) => toasts.hover(e.sender, !!on))

  ipcMain.handle('panel:open', (_e, page) => {
    showPanel(typeof page === 'string' ? page : 'modules')
  })

  ipcMain.handle('app:quit', () => quitApp())
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))
}

function registerGlobalShortcuts() {
  const shortcuts = {
    'Alt+Shift+O': () => toggleAllWidgets(),
    'Alt+Shift+T': () => updateGeneral({ clickThrough: !config.general.clickThrough }),
    'Alt+Shift+M': () => showPanel()
  }
  for (const [accel, fn] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accel, fn)) log(`[main] shortcut ${accel} could not be registered`)
  }
}

function quitApp() {
  isQuitting = true
  app.quit()
}

// ---------------------------------------------------------------------------
// Widgets

const widgets = createWidgetManager({
  getConfig: () => config,
  // Position changes are saved silently (no need to re-render every window).
  savePosition: (id, position) => {
    setModule(id, { widget: { position } })
    config = loadConfig()
  },
  onContextMenu: (id) => showWidgetMenu(id),
  onCloseRequest: (id) => setWidget(id, { visible: false }),
  isQuitting: () => isQuitting,
  isDark,
  log
})

const toasts = createToastManager({ log, durationMs: TOAST_MS })

// ---------------------------------------------------------------------------
// App lifecycle

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  // Launching the app again opens the Control Panel.
  app.on('second-instance', () => showPanel())

  app.whenReady().then(async () => {
    trimLog()
    app.setAppUserModelId('com.aroco.nomos')
    if (process.platform === 'darwin') app.dock?.hide()

    await initNative(log)
    nativeTheme.on('updated', () => {
      for (const w of widgets.all()) setGlassDarkMode(w, isDark())
    })
    config = loadConfig()
    for (const m of MANIFESTS) {
      const factory = SERVICES[m.id]
      if (factory) services.set(m.id, factory(createServiceContext(m.id)))
    }

    registerIpc()
    createTray()
    registerGlobalShortcuts()
    commit(null)

    if (config.general.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true })

    if (IS_TEST) {
      try {
        const { runSelfTest } = await import('./selftest.js')
        await runSelfTest({
          getConfig: () => config,
          updateModule,
          updateGeneral,
          toggleAllWidgets,
          widgets,
          toasts,
          services,
          showPanel,
          getPanel,
          log
        })
      } catch (err) {
        log(`[test] CRASH ${err && err.stack ? err.stack : String(err)}`)
      } finally {
        quitApp()
      }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 || !getPanel()) showPanel()
  })

  // Keep running in the tray when the Control Panel is closed.
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
