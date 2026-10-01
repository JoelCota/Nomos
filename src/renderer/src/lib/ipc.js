// Thin wrapper over the preload bridge.
export const invoke = (channel, ...args) => window.api.invoke(channel, ...args)
export const on = (channel, cb) => window.api.on(channel, cb)

export const setGeneral = (patch) => invoke('config:set-general', patch)
export const setModule = (id, patch) => invoke('config:set-module', id, patch)
export const setWidget = (id, widget) => setModule(id, { widget })
export const setModuleSettings = (id, settings) => setModule(id, { settings })
export const openPanel = (page) => invoke('panel:open', page)
