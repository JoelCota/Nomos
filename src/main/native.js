// Windows-only native helpers (via koffi). On other systems, or if koffi can't
// load, every function is a harmless no-op and the features report as unsupported.
import { release } from 'os'

let api = null

const GWLP_HWNDPARENT = -8
const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const DWMWA_USE_IMMERSIVE_DARK_MODE = 20
const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const DWMWA_SYSTEMBACKDROP_TYPE = 38
const DWMWCP_ROUND = 2
const DWMSBT_TRANSIENTWINDOW = 3 // "acrylic"

// Function signatures, exported so they can be checked on any OS.
export const SIGNATURES = {
  FindWindowW: 'intptr __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)',
  SetWindowLongPtrW: 'intptr __stdcall SetWindowLongPtrW(intptr hWnd, int nIndex, intptr dwNewLong)',
  SetWindowPos: 'bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)',
  DwmSetWindowAttribute: 'long __stdcall DwmSetWindowAttribute(intptr hwnd, uint dwAttribute, _In_ int *pvAttribute, uint cbAttribute)',
  DwmExtendFrameIntoClientArea: 'long __stdcall DwmExtendFrameIntoClientArea(intptr hWnd, _In_ NOMOS_MARGINS *pMarInset)'
}
export const defineMargins = (koffi) => koffi.struct('NOMOS_MARGINS', { left: 'int', right: 'int', top: 'int', bottom: 'int' })

export async function initNative(log = () => {}) {
  if (process.platform !== 'win32') return
  try {
    const koffi = (await import('koffi')).default
    const user32 = koffi.load('user32.dll')
    const dwmapi = koffi.load('dwmapi.dll')
    defineMargins(koffi)
    api = {
      FindWindowW: user32.func(SIGNATURES.FindWindowW),
      SetWindowLongPtrW: user32.func(SIGNATURES.SetWindowLongPtrW),
      SetWindowPos: user32.func(SIGNATURES.SetWindowPos),
      DwmSetWindowAttribute: dwmapi.func(SIGNATURES.DwmSetWindowAttribute),
      DwmExtendFrameIntoClientArea: dwmapi.func(SIGNATURES.DwmExtendFrameIntoClientArea)
    }
    log('[native] ready')
  } catch (err) {
    api = null
    log(`[native] unavailable: ${String(err)}`)
  }
}

// Windows 11 22H2 = build 22621.
const windowsBuild = () => Number(release().split('.')[2] ?? 0)

// Self-test only: pretend glass is supported to exercise the window rebuild logic.
const fakeGlass = () => process.env.NOMOS_TEST === '1' && process.env.NOMOS_FAKE_GLASS === '1'

export const supports = {
  desktopLayer: () => !!api,
  glass: () => fakeGlass() || (!!api && windowsBuild() >= 22621)
}

const hwndOf = (win) => {
  const b = win.getNativeWindowHandle()
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0)
}

export const desktopHandle = () => (api ? Number(api.FindWindowW('Progman', null)) || 0 : 0)

// "Al fondo" (like Rainmeter): the widget becomes owned by the desktop window
// (Progman), so it stays above the wallpaper, below every other window, and is
// not hidden by Win+D / "Mostrar escritorio".
export function setDesktopOwner(win, on) {
  if (!api) return false
  try {
    const owner = on ? desktopHandle() : 0
    if (on && !owner) return false
    api.SetWindowLongPtrW(hwndOf(win), GWLP_HWNDPARENT, owner)
    if (on) sendToBack(win)
    return true
  } catch {
    return false
  }
}

export function sendToBack(win) {
  if (!api) return
  try {
    api.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)
  } catch {
    /* ignore */
  }
}

// Experimental acrylic backdrop drawn by Windows (DWM) behind the transparent window.
export function applyGlass(win, dark) {
  if (!supports.glass()) return false
  try {
    const h = hwndOf(win)
    api.DwmExtendFrameIntoClientArea(h, { left: -1, right: -1, top: -1, bottom: -1 })
    api.DwmSetWindowAttribute(h, DWMWA_USE_IMMERSIVE_DARK_MODE, new Int32Array([dark ? 1 : 0]), 4)
    api.DwmSetWindowAttribute(h, DWMWA_WINDOW_CORNER_PREFERENCE, new Int32Array([DWMWCP_ROUND]), 4)
    return api.DwmSetWindowAttribute(h, DWMWA_SYSTEMBACKDROP_TYPE, new Int32Array([DWMSBT_TRANSIENTWINDOW]), 4) === 0
  } catch {
    return false
  }
}

export function setGlassDarkMode(win, dark) {
  if (!supports.glass()) return
  try {
    api.DwmSetWindowAttribute(hwndOf(win), DWMWA_USE_IMMERSIVE_DARK_MODE, new Int32Array([dark ? 1 : 0]), 4)
  } catch {
    /* ignore */
  }
}
