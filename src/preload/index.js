import { contextBridge, ipcRenderer } from 'electron'

// Generic bridge. Channels look like "<scope>:<action>" — "config:get",
// "pomodoro:toggle", "habits:check"... so new modules don't need preload changes.
const CHANNEL = /^[a-z][a-z0-9-]*:[a-z0-9-]+$/

const check = (channel) => {
  if (typeof channel !== 'string' || !CHANNEL.test(channel)) throw new Error(`Invalid IPC channel: ${channel}`)
}

contextBridge.exposeInMainWorld('api', {
  isTest: process.argv.includes('--pomodoro-test'),
  platform: process.platform,
  invoke: (channel, ...args) => {
    check(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, cb) => {
    check(channel)
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
})
