import { contextBridge, ipcRenderer } from 'electron'

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    add: (task) => ipcRenderer.invoke('tasks:add', task),
    update: (id, patch) => ipcRenderer.invoke('tasks:update', id, patch),
    remove: (id) => ipcRenderer.invoke('tasks:delete', id)
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    add: (entry) => ipcRenderer.invoke('history:add', entry),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  syncTimer: (status) => ipcRenderer.send('timer:sync', status),
  win: {
    hide: () => ipcRenderer.send('win:hide'),
    minimize: () => ipcRenderer.send('win:minimize'),
    blur: () => ipcRenderer.send('win:blur'),
    collapse: (h) => ipcRenderer.send('win:collapse', h),
    restoreSize: () => ipcRenderer.send('win:restore-size')
  },
  app: {
    quit: () => ipcRenderer.send('app:quit'),
    getInfo: () => ipcRenderer.invoke('app:getInfo')
  },
  onTimerToggle: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('timer:toggle', listener)
    return () => ipcRenderer.removeListener('timer:toggle', listener)
  },
  onTimerReset: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('timer:reset', listener)
    return () => ipcRenderer.removeListener('timer:reset', listener)
  },
  onNavigateHome: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('navigate:home', listener)
    return () => ipcRenderer.removeListener('navigate:home', listener)
  },
  onChromeReveal: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('chrome:reveal', listener)
    return () => ipcRenderer.removeListener('chrome:reveal', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
