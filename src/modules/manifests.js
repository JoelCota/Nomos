// Module registry (data only). To add a module: create src/modules/<id>/ with a
// manifest.js, add it here, and register its UI in registry.renderer.js and, if it
// needs background work, its service in registry.main.js.
import clock from './clock/manifest.js'
import pomodoro from './pomodoro/manifest.js'
import habits from './habits/manifest.js'

// Order = order in the Control Panel and the tray, and bottom-up stacking order
// for widgets that have no saved position yet (last one sits in the corner).
export const MANIFESTS = [clock, pomodoro, habits]

export const getManifest = (id) => MANIFESTS.find((m) => m.id === id)
