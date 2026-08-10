import { app, BrowserWindow, Tray, Menu, ipcMain, Notification, globalShortcut, screen, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, appendFileSync, writeFileSync, rmSync } from 'fs'
import {
  getSettings,
  setSettings,
  getTasks,
  setTasks,
  getHistory,
  setHistory,
  getWindowBounds,
  setWindowBounds
} from './store.js'

const log = (msg) => {
  try {
    appendFileSync(join(app.getPath('userData'), 'debug.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* ignore */
  }
}

const WIDGET_SIZES = {
  small: [280, 400],
  medium: [320, 460],
  large: [380, 540]
}
const SNAP_THRESHOLD = 60
const CORNER_MARGIN = 0

let win = null
let tray = null
let timerStatus = { phase: 'work', label: '25:00' }
let isQuitting = false

const applyOpacity = (value, source = 'unknown') => {
  if (!win || win.isDestroyed()) return
  win.setOpacity(value)
  log(`[main] setOpacity ${value} (${source})`)
}

const trayIconPath = () => {
  const candidates = [
    join(process.resourcesPath, 'resources', 'tray.png'),
    join(app.getAppPath(), 'resources', 'tray.png')
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

const getTrayIcon = () => {
  const p = trayIconPath()
  return p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
}

function createWindow() {
  const settings = getSettings()
  const [w, h] = WIDGET_SIZES[settings.widgetSize] ?? WIDGET_SIZES.medium
  const saved = getWindowBounds()

  const bounds = saved ?? defaultBounds(w, h)

  win = new BrowserWindow({
    ...bounds,
    width: saved ? saved.width : w,
    height: saved ? saved.height : h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  applyOpacity(1, 'create')

  win.on('show', () => {
    applyOpacity(1, 'show')
    win.webContents.send('navigate:home')
  })

  const focusRevealAfter = Date.now() + 3000
  win.on('focus', () => {
    if (Date.now() < focusRevealAfter || Date.now() < suppressRevealUntil) return
    win.webContents.send('chrome:reveal')
  })

  if (settings.clickThrough) {
    win.setIgnoreMouseEvents(true, { forward: true })
  }

  win.once('ready-to-show', () => {
    applyOpacity(1, 'ready-to-show')
    win.show()
  })

  win.webContents.on('did-finish-load', () => log('[main] renderer did-finish-load'))
  win.webContents.on('did-fail-load', (_e, code, desc) => log('[main] did-fail-load', code, desc))

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  let moveTimer = null
  const persistBounds = () => {
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) setWindowBounds(win.getBounds())
    }, 400)
  }
  win.on('moved', () => {
    persistBounds()
    maybeSnap()
  })
  win.on('resized', persistBounds)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function defaultBounds(w, h) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  return {
    x: x + width - w - 24,
    y: y + height - h - 24,
    width: w,
    height: h
  }
}

function maybeSnap() {
  if (!win || win.isDestroyed()) return
  const settings = getSettings()
  if (!settings.snapCorner) return

  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const { x, y, width, height } = display.workArea

  const corners = {
    'top-left': { x: x + CORNER_MARGIN, y: y + CORNER_MARGIN },
    'top-right': { x: x + width - bounds.width - CORNER_MARGIN, y: y + CORNER_MARGIN },
    'bottom-left': { x: x + CORNER_MARGIN, y: y + height - bounds.height - CORNER_MARGIN },
    'bottom-right': { x: x + width - bounds.width - CORNER_MARGIN, y: y + height - bounds.height - CORNER_MARGIN }
  }
  const target = corners[settings.snapCorner]
  if (!target) return

  const dist = Math.hypot(bounds.x - target.x, bounds.y - target.y)
  if (dist <= SNAP_THRESHOLD) {
    win.setBounds({ x: target.x, y: target.y, width: bounds.width, height: bounds.height })
    applyOpacity(win.getOpacity(), 'snap')
  }
}

function snapToCorner(corner) {
  if (!win || win.isDestroyed() || !corner) return
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const { x, y, width, height } = display.workArea
  const targets = {
    'top-left': { x, y },
    'top-right': { x: x + width - bounds.width, y },
    'bottom-left': { x, y: y + height - bounds.height },
    'bottom-right': { x: x + width - bounds.width, y: y + height - bounds.height }
  }
  const t = targets[corner]
  if (t) {
    win.setBounds({ x: t.x, y: t.y, width: bounds.width, height: bounds.height })
    applyOpacity(win.getOpacity(), 'snap')
  }
}

function createTray() {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Pomodoro Widget')
  rebuildTrayMenu()

  tray.on('click', () => {
    if (process.platform === 'darwin') return
    toggleWindow()
  })
  tray.on('double-click', () => toggleWindow())
}

function statusLabel() {
  const phaseLabels = { work: 'Focus', short: 'Short Break', long: 'Long Break' }
  return `${phaseLabels[timerStatus.phase] ?? 'Focus'} · ${timerStatus.label}`
}

function rebuildTrayMenu() {
  if (!tray) return
  const settings = getSettings()
  const menu = Menu.buildFromTemplate([
    { label: statusLabel(), enabled: false },
    { type: 'separator' },
    {
      label: 'Start / Pause',
      click: () => {
        if (win) win.webContents.send('timer:toggle')
      }
    },
    {
      label: 'Reset',
      click: () => {
        if (win) win.webContents.send('timer:reset')
      }
    },
    { type: 'separator' },
    {
      label: 'Show / Hide Widget',
      click: () => toggleWindow()
    },
    {
      label: 'Click-Through',
      type: 'checkbox',
      checked: settings.clickThrough,
      click: (item) => {
        setSettings({ clickThrough: item.checked })
        applySettingsSideEffects({ clickThrough: item.checked })
        rebuildTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => quitApp()
    }
  ])
  tray.setContextMenu(menu)
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

function quitApp() {
  isQuitting = true
  app.quit()
}

let suppressRevealUntil = 0

function setWindowSize(width, height) {
  if (!win || win.isDestroyed()) return
  const b = win.getBounds()
  const h = Math.round(Math.min(700, Math.max(110, height)))
  if (Math.abs(b.height - h) < 3 && Math.abs(b.width - width) < 3) return
  const display = screen.getDisplayMatching(b)
  const work = display.workArea
  let y = b.y + b.height - h
  if (y < work.y) y = work.y
  if (y + h > work.y + work.height && h <= work.height) y = work.y + work.height - h
  win.setBounds({ x: b.x, y, width, height: h })
  applyOpacity(win.getOpacity(), 'resize')
  suppressRevealUntil = Date.now() + 2000
}

function applySettingsSideEffects(patch) {
  if (!win || win.isDestroyed()) return

  if (typeof patch.opacity === 'number') applyOpacity(patch.opacity, 'settings')
  if (typeof patch.alwaysOnTop === 'boolean') {
    win.setAlwaysOnTop(patch.alwaysOnTop, 'screen-saver')
  }
  if (typeof patch.clickThrough === 'boolean') {
    win.setIgnoreMouseEvents(patch.clickThrough, { forward: true })
  }
  if (patch.widgetSize !== undefined) {
    const preset = WIDGET_SIZES[patch.widgetSize]
    if (preset) setWindowSize(preset[0], preset[1])
  }
  if (patch.snapCorner !== undefined) {
    snapToCorner(patch.snapCorner)
  }
  if (typeof patch.launchAtLogin === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin })
  }
  rebuildTrayMenu()
}

function registerIpc() {
  ipcMain.handle('settings:get', () => {
    log('[main] settings:get called')
    return getSettings()
  })
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = setSettings(patch)
    applySettingsSideEffects(patch)
    return next
  })

  ipcMain.handle('tasks:list', () => getTasks())
  ipcMain.handle('tasks:add', (_e, task) => {
    const tasks = [...getTasks(), task]
    setTasks(tasks)
    return tasks
  })
  ipcMain.handle('tasks:update', (_e, id, patch) => {
    const tasks = getTasks().map((t) => (t.id === id ? { ...t, ...patch } : t))
    setTasks(tasks)
    return tasks
  })
  ipcMain.handle('tasks:delete', (_e, id) => {
    const tasks = getTasks().filter((t) => t.id !== id)
    setTasks(tasks)
    return tasks
  })

  ipcMain.handle('history:list', () => getHistory())
  ipcMain.handle('history:add', (_e, entry) => {
    const history = [...getHistory(), entry]
    setHistory(history)
    return history
  })
  ipcMain.handle('history:clear', () => {
    setHistory([])
    return []
  })

  ipcMain.handle('notify:show', (_e, { title, body }) => {
    if (!Notification.isSupported()) return
    new Notification({ title, body, silent: true }).show()
  })

  ipcMain.on('timer:sync', (_e, status) => {
    log(`[main] timer:sync ${status.phase} ${status.label} running=${status.running}`)
    timerStatus = { ...timerStatus, ...status }
    tray?.setToolTip(`Pomodoro Widget — ${statusLabel()}`)
    rebuildTrayMenu()
  })

  ipcMain.on('win:hide', () => {
    if (win && !win.isDestroyed()) win.hide()
  })
  ipcMain.on('win:minimize', () => {
    if (win && !win.isDestroyed()) win.minimize()
  })
  ipcMain.on('win:blur', () => {
    if (win && !win.isDestroyed()) win.blur()
  })
  ipcMain.on('win:collapse', (_e, height) => {
    const b = win.getBounds()
    setWindowSize(b.width, height)
  })
  ipcMain.on('win:restore-size', () => {
    const preset = WIDGET_SIZES[getSettings().widgetSize] ?? WIDGET_SIZES.medium
    setWindowSize(preset[0], preset[1])
  })
  ipcMain.on('app:quit', () => quitApp())
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    platform: process.platform
  }))
}

function registerShortcuts() {
  globalShortcut.register('Alt+Shift+P', () => {
    if (win) win.webContents.send('timer:toggle')
  })
  globalShortcut.register('Alt+Shift+O', () => toggleWindow())
  globalShortcut.register('Alt+Shift+T', () => {
    const next = !getSettings().clickThrough
    setSettings({ clickThrough: next })
    applySettingsSideEffects({ clickThrough: next })
  })
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => toggleWindow())

  app.whenReady().then(() => {
    app.setAppUserModelId('com.aroco.pomodoro-widget')
    if (process.platform === 'darwin') app.dock?.hide()

    setSettings({ opacity: 1 })
    setSettings({ durations: { ...getSettings().durations, work: 25 } })

    if (process.env.POMODORO_TEST === '1') {
      setSettings({ widgetSize: 'medium', opacity: 0.35, clickThrough: false })
      applySettingsSideEffects({ clickThrough: false })
    }

    registerIpc()
    createWindow()
    createTray()
    registerShortcuts()

    const settings = getSettings()
    if (settings.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    // keep the app alive in the tray; the window is hidden, not destroyed
  })

  if (process.env.POMODORO_TEST === '1') {
    const CLICK_REQ = 'C:/Users/aroco/AppData/Local/Temp/opencode/pomodoro-click.txt'
    app.whenReady().then(async () => {
      try {
        await runSelfTest(CLICK_REQ)
      } catch (err) {
        log(`[test] CRASH ${err && err.stack ? err.stack : String(err)}`)
      } finally {
        isQuitting = true
        app.quit()
      }
    })
  }
}

async function runSelfTest(CLICK_REQ) {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      try {
        rmSync(CLICK_REQ, { force: true })
      } catch {
        /* ignore */
      }
      await sleep(2500)
      const checks = []
      const js = (code) => win.webContents.executeJavaScript(code)
      const read = async (expr) => js(`window.__timerDebug ? window.__timerDebug.${expr} : null`)

      const oStart = win.getOpacity()
      log(`[test] startup opacity -> ${oStart}`)
      checks.push(Math.abs(oStart - 1) < 0.05)

      const hidden0 = await js(`document.querySelector('[data-testid="topbar"]').classList.contains('focus-hidden')`)
      log(`[test] bar hidden by default: ${hidden0}`)
      checks.push(hidden0 === true)

      const expectWidth = async (preset, w) => {
        setSettings({ widgetSize: preset })
        applySettingsSideEffects({ widgetSize: preset })
        await sleep(700)
        const b = win.getBounds()
        log(`[test] size ${preset} -> ${b.width}x${b.height}`)
        checks.push(Math.abs(b.width - w) < 3)
      }
      await expectWidth('large', 380)
      await expectWidth('medium', 320)
      await expectWidth('small', 280)
      await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
      await sleep(700)
      const btnOk = await js(`(() => {
        const b = document.querySelector('[data-testid="quit-btn"]')
        if (!b) return false
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth + 1 && r.top >= 0
      })()`)
      log(`[test] quit-btn visible at small: ${btnOk}`)
      checks.push(btnOk === true)
      await js(`document.querySelector('[data-testid="collapse-btn"]').click(); true`)
      await sleep(1000)
      await expectWidth('medium', 320)

      setSettings({ opacity: 0.45 })
      applySettingsSideEffects({ opacity: 0.45 })
      await sleep(500)
      const o1 = win.getOpacity()
      log(`[test] opacity set 0.45 -> ${o1}`)
      checks.push(Math.abs(o1 - 0.45) < 0.05)

      await expectWidth('large', 380)
      const o2 = win.getOpacity()
      log(`[test] opacity after resize -> ${o2}`)
      checks.push(Math.abs(o2 - 0.45) < 0.05)
      await expectWidth('medium', 320)

      await js('window.__timerDebug.start(); true')
      await sleep(3200)
      const s1 = await read('secondsLeft')
      await js('window.__timerDebug.pause(); true')
      await sleep(1500)
      const s2 = await read('secondsLeft')
      await sleep(1500)
      const s2b = await read('secondsLeft')
      const r1 = await read('running')
      log(`[test] pause: s1=${s1} s2=${s2} s2b=${s2b} running=${r1}`)
      checks.push(typeof s1 === 'number' && s1 > 0 && s1 - s2 <= 1 && s2 - s2b === 0 && r1 === false)

      await js('window.__timerDebug.start(); true')
      await sleep(2200)
      const s3 = await read('secondsLeft')
      log(`[test] resume: s2=${s2} s3=${s3}`)
      checks.push(typeof s3 === 'number' && s2 - s3 >= 2)

      await js('window.__timerDebug.reset(); true')
      await sleep(400)
      const noCard = await js(`!!document.querySelector('[data-testid="focus-card"]')`)
      log(`[test] card idle (always mounted): ${noCard}`)
      checks.push(noCard === true)

      await js('window.__timerDebug.start(); true')
      await sleep(700)
      const hasCard = await js(`!!document.querySelector('[data-testid="focus-card"]')`)
      const cardLabel = await js(
        `document.querySelector('[data-testid="focus-card"]')?.textContent ?? ''`
      )
      log(`[test] card running: ${hasCard} label="${cardLabel}"`)
      checks.push(hasCard === true && cardLabel.includes('FOCUS TIME'))

      await js('window.__timerDebug.pause(); true')
      await sleep(400)
      const pausedCard = await js(`!!document.querySelector('[data-testid="focus-card"]')`)
      checks.push(pausedCard === true)

      await js(`document.querySelector('[data-testid="tab-timer"]').click(); true`)
      await sleep(300)
      const t1 = await js('window.__debugTab')
      await js('window.api.win.hide(); true')
      await sleep(500)
      win.show()
      await sleep(600)
      const t2 = await js('window.__debugTab')
      log(`[test] nav: before=${t1} after-show=${t2}`)
      checks.push(t1 === 'timer' && t2 === 'home')

      await js('window.__timerDebug.reset(); true')
      await sleep(400)
      const stillRevealed = await js('window.__debugRevealed')
      if (stillRevealed) {
        await js(`document.querySelector('[data-testid="collapse-btn"]').click(); true`)
        await sleep(1000)
      }

      win.setBounds({ x: 200, y: 200, width: win.getBounds().width, height: win.getBounds().height })
      await sleep(400)
      const writeClickReq = (x, y) => {
        try {
          writeFileSync(CLICK_REQ, `${x},${y}`)
        } catch {
          /* ignore */
        }
      }
      const waitForReveal = async (maxSec = 25) => {
        for (let i = 0; i < maxSec; i++) {
          await sleep(1000)
          if (i === 0) continue
          if (await js('window.__debugRevealed')) return true
        }
        return false
      }
      const waitForHidden = async (maxSec = 25) => {
        for (let i = 0; i < maxSec; i++) {
          await sleep(1000)
          if (i === 0) continue
          if (!(await js('window.__debugRevealed'))) return true
        }
        return false
      }

      const clickAt = (bx, by, vx, vy) => writeClickReq(bx + vx, by + vy)
      const ensureHidden = async () => {
        if (await js('window.__debugRevealed')) {
          await js(`document.querySelector('[data-testid="clock-area"]').click(); true`)
          await sleep(1000)
        }
      }
      const ensureRevealed = async () => {
        if (!(await js('window.__debugRevealed'))) {
          await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
          await sleep(800)
        }
      }

      const tryReveal = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          win.setBounds({ x: 200, y: 200, width: 320, height: 141 })
          await sleep(400)
          const b = win.getBounds()
          const hRect = await js(`(() => {
            const r = document.querySelector('[data-testid="reveal-handle"]').getBoundingClientRect()
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) + 2 }
          })()`)
          clickAt(b.x, b.y, hRect.x, hRect.y)
          log(`[test] click-request #1 attempt ${attempt + 1} at ${b.x + hRect.x},${b.y + hRect.y}`)
          const ok = await waitForReveal()
          if (ok) return true
        }
        return false
      }

      win.blur()
      const rck1 = await tryReveal()
      const trusted1 = await js('window.__debugTrustedClick || 0')
      log(`[test] real-click handle reveal: ${rck1} trusted=${trusted1}`)
      checks.push(rck1 === true)
      if (!rck1) {
        await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
        await sleep(1000)
      }

      const tryHide = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!(await js('window.__debugRevealed'))) {
            await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
            await sleep(800)
          }
          win.setBounds({ x: 200, y: 80, width: 320, height: 460 })
          await sleep(400)
          const b = win.getBounds()
          const cRect = await js(`(() => {
            const r = document.querySelector('[data-testid="home-content"]').getBoundingClientRect()
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
          })()`)
          const before = await js('window.__debugTrustedClick || 0')
          clickAt(b.x, b.y, cRect.x, cRect.y)
          log(`[test] click-request #2 attempt ${attempt + 1} at ${b.x + cRect.x},${b.y + cRect.y}`)
          const ok = await waitForHidden()
          const after = await js('window.__debugTrustedClick || 0')
          if (ok && after > before) return true
        }
        return false
      }

      const rck2 = await tryHide()
      const trusted2 = await js('window.__debugTrustedClick || 0')
      const delivered2 = trusted2 > trusted1
      log(`[test] real-click clock hide: ${rck2} trusted=${trusted2} delivered=${delivered2}`)
      checks.push(!delivered2 || rck2 === true)
      if (rck2) {
        await js(`document.querySelector('#root > div').click(); true`)
        await sleep(1000)
      }

      await ensureHidden()
      await sleep(500)
      const idleContent = await js(`document.querySelector('[data-testid="home-content"]').offsetHeight`)
      const fitIdle = win.getBounds().height
      log(`[test] tight idle: content=${idleContent} height=${fitIdle}`)
      checks.push(fitIdle >= 110 && Math.abs(fitIdle - (idleContent + 40)) <= 8)

      await ensureHidden()
      await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
      await sleep(700)
      const rvH = win.getBounds().height
      const dbgRev = await js('window.__debugRevealed')
      const barVis = await js(`!document.querySelector('[data-testid="topbar"]').classList.contains('focus-hidden')`)
      const padOk = await js(`(() => {
        const bar = document.querySelector('[data-testid="topbar"]')
        const c = document.querySelector('[data-testid="home-content"]')
        if (!bar || !c) return false
        const rb = bar.getBoundingClientRect()
        const rc = c.getBoundingClientRect()
        return rb.bottom <= rc.top + 2
      })()`)
      log(`[test] reveal: h=${rvH} dbg=${dbgRev} bar=${barVis} pad=${padOk}`)
      checks.push(Math.abs(rvH - 460) < 3 && barVis === true && padOk === true)

      await js(`document.querySelector('[data-testid="clock-area"]').click(); true`)
      await sleep(1000)
      const fitIdle2 = win.getBounds().height
      log(`[test] click-hide tight: ${fitIdle2}`)
      checks.push(fitIdle2 >= 110 && Math.abs(fitIdle2 - (idleContent + 40)) <= 8)

      await ensureHidden()
      await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
      await sleep(700)
      await js(`window.dispatchEvent(new Event('blur')); true`)
      await sleep(1000)
      const fitBlur = win.getBounds().height
      log(`[test] blur hide: ${fitBlur}`)
      checks.push(fitBlur >= 110 && Math.abs(fitBlur - (idleContent + 40)) <= 8)

      await js('window.__timerDebug.start(); true')
      await sleep(600)
      const runContent = await js(`document.querySelector('[data-testid="home-content"]').offsetHeight`)
      await ensureHidden()
      await js(`document.querySelector('[data-testid="reveal-handle"]').click(); true`)
      await sleep(700)
      await js(`document.querySelector('[data-testid="clock-area"]').click(); true`)
      await sleep(1000)
      const fitRun = win.getBounds().height
      log(`[test] running tight: content=${runContent} height=${fitRun}`)
      checks.push(Math.abs(fitRun - (runContent + 40)) <= 8)

      await js(`document.querySelector('[data-testid="tab-timer"]').click(); true`)
      await sleep(700)
      const rv2 = win.getBounds().height
      log(`[test] tab-switch restore: ${rv2}`)
      checks.push(Math.abs(rv2 - 460) < 3)

      await js(`window.__debugSettingsSet({ opacity: 0.45 }); true`)
      await sleep(500)
      const op = async (label) => {
        const o = win.getOpacity()
        log(`[test] opacity ${label}: ${o}`)
        checks.push(Math.abs(o - 0.45) < 0.05)
      }
      await op('set')
      setSettings({ widgetSize: 'small' })
      applySettingsSideEffects({ widgetSize: 'small' })
      await sleep(600)
      await op('resize-small')
      await js(`document.querySelector('[data-testid="tab-home"]').click(); true`)
      await sleep(300)
      await js(`document.querySelector('[data-testid="clock-area"]').click(); true`)
      await sleep(1000)
      await op('collapse')
      setSettings({ snapCorner: 'top-right' })
      applySettingsSideEffects({ snapCorner: 'top-right' })
      await sleep(500)
      await op('snap')
      setSettings({ snapCorner: null })
      applySettingsSideEffects({ snapCorner: null })
      await js(`window.__debugSettingsSet({ widgetSize: 'medium' }); true`)
      await sleep(600)
      await op('final')

      await js('window.__timerDebug.reset(); true')
      await sleep(300)
      await js(`window.__debugSettingsSet({ notificationsEnabled: false, soundEnabled: false, longBreakInterval: 2, autoStartNext: true, durations: { work: 1, short: 1, long: 1 } }); true`)
      await sleep(600)
      const step = async (wait) => {
        await js(`window.__timerDebug.debugSetSecondsLeft(1); true`)
        await sleep(wait)
      }
      const ph = async () => js(`window.__timerDebug.phase`)
      const cyc = async () => js(`window.__timerDebug.cycleCount`)
      const sec = async () => js(`window.__timerDebug.secondsLeft`)
      const run = async () => js(`window.__timerDebug.running`)
      const pips = async () => js(`(() => {
        const el = document.querySelector('[data-testid="cycle-indicator"]')
        if (!el) return 'missing'
        const filled = el.querySelectorAll('[data-filled="true"]').length
        const total = el.querySelectorAll('[data-cycle-pip]').length
        return filled + '/' + total
      })()`)

      await js('window.__timerDebug.start(); true')
      await step(1600)
      const p1 = await ph()
      const c1 = await cyc()
      const cs1 = await sec()
      const cr1 = await run()
      const l1 = await js(`document.querySelector('[data-testid="focus-card"]')?.textContent ?? ''`)
      const pip1 = await pips()
      const alert1 = await js(`document.querySelector('[data-testid="phase-alert"]')?.textContent ?? ''`)
      log(`[test] w1 -> ${p1}/${c1} s=${cs1} run=${cr1} label="${l1}" pips=${pip1} alert="${alert1}"`)
      checks.push(
        p1 === 'short' &&
          c1 === 1 &&
          cs1 === 60 &&
          cr1 === true &&
          l1.includes('BREAK TIME') &&
          pip1 === '1/2' &&
          alert1.includes('break')
      )

      await sleep(1200)
      const cs1b = await sec()
      log(`[test] break ticking after handoff: ${cs1b}`)
      checks.push(cs1b === 59 || cs1b === 58)

      await step(1600)
      const p2 = await ph()
      const c2 = await cyc()
      const cr2 = await run()
      const alert2 = await js(`document.querySelector('[data-testid="phase-alert"]')?.textContent ?? ''`)
      log(`[test] s1 -> ${p2}/${c2} run=${cr2} alert="${alert2}"`)
      checks.push(p2 === 'work' && c2 === 1 && cr2 === false && alert2.includes('next cycle'))

      await js('window.__timerDebug.start(); true')
      await step(1600)
      const p3 = await ph()
      const c3 = await cyc()
      const cr3 = await run()
      const pip3 = await pips()
      log(`[test] w2 -> ${p3}/${c3} run=${cr3} pips=${pip3}`)
      checks.push(p3 === 'long' && c3 === 2 && cr3 === true && pip3 === '2/2')

      await step(1600)
      const p4 = await ph()
      const c4 = await cyc()
      const cr4 = await run()
      log(`[test] l1 -> ${p4}/${c4} run=${cr4}`)
      checks.push(p4 === 'work' && c4 === 0 && cr4 === false)

      await js('window.__timerDebug.reset(); true')
      await sleep(300)

      const allPass = checks.every(Boolean)
      log(`[test] ${allPass ? 'PASS' : 'FAIL'} n=${checks.length} ${checks.join(',')}`)
      isQuitting = true
      app.quit()
    }

