// Control Panel: a regular (non-floating) window with module toggles and settings.
import { BrowserWindow, nativeTheme } from 'electron'
import { baseWebPreferences, loadView } from './views.js'

let panel = null
const alive = () => panel && !panel.isDestroyed()

export function openPanel(page, theme = 'system') {
  if (alive()) {
    if (page) panel.webContents.send('panel:navigate', page)
    if (panel.isMinimized()) panel.restore()
    panel.show()
    panel.focus()
    return panel
  }
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  panel = new BrowserWindow({
    width: 880,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    title: 'Panel de control',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: dark ? '#161618' : '#f5f5f7',
    webPreferences: baseWebPreferences()
  })
  panel.setMenuBarVisibility(false)
  panel.once('ready-to-show', () => panel?.show())
  panel.on('closed', () => {
    panel = null
  })
  loadView(panel, { view: 'panel', page: page ?? 'modules' })
  return panel
}

export const getPanel = () => (alive() ? panel : null)
