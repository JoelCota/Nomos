// Nomos icons: the window icon and the tray glyph (white on dark taskbars,
// black on light ones; a template image on macOS so the system tints it).
import { app, nativeImage, nativeTheme } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const resource = (name) =>
  [join(process.resourcesPath, 'resources', name), join(app.getAppPath(), 'resources', name)].find((p) => existsSync(p)) ??
  null

export const windowIconPath = () => resource(process.platform === 'win32' ? 'icon.ico' : 'icon.png')
export const iconPngPath = () => resource('icon.png')

// tray-<variant>.png plus @2x / @3x, which nativeImage picks up on its own.
export function trayImage(lightTaskbar) {
  const p = resource(`tray-${lightTaskbar || process.platform === 'darwin' ? 'light' : 'dark'}.png`)
  const img = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}

const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

// Windows lets the taskbar ("system") and apps use different themes, so read the
// taskbar's own setting. Elsewhere, follow the system theme.
export function taskbarIsLight() {
  if (process.platform !== 'win32') return Promise.resolve(!nativeTheme.shouldUseDarkColors)
  return new Promise((resolve) => {
    execFile('reg', ['query', PERSONALIZE, '/v', 'SystemUsesLightTheme'], { windowsHide: true, timeout: 3000 }, (err, out) => {
      if (err) return resolve(false) // Older Windows: dark taskbar.
      resolve(/SystemUsesLightTheme\s+REG_DWORD\s+0x0*1\b/i.test(String(out)))
    })
  })
}
