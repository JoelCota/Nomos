import Store from 'electron-store'
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { MANIFESTS } from '../modules/manifests.js'
import { SCHEMA_VERSION, buildConfig, migrateV1 } from '../shared/config.js'
import { mergeDeep } from '../shared/merge.js'

const V1_KEYS = ['settings', 'tasks', 'history', 'windowBounds']

// Created lazily so the userData path can be changed (self-test) before the
// store file is opened.
let store = null
let migrationInfo = null
let adoptedFrom = null

const STORE_NAME = 'nomos'

// The app used to be called "Pomodoro Widget": its data lived in another
// userData folder and file. On the first run as Nomos, copy it over (the old
// file is left untouched as a backup).
function adoptLegacyData() {
  const userData = app.getPath('userData')
  if (existsSync(join(userData, `${STORE_NAME}.json`))) return null
  const candidates = [
    join(userData, 'pomodoro-widget.json'),
    join(app.getPath('appData'), 'Pomodoro Widget', 'pomodoro-widget.json'),
    join(app.getPath('appData'), 'pomodoro-widget', 'pomodoro-widget.json')
  ]
  const source = candidates.find((p) => existsSync(p))
  if (!source) return null
  mkdirSync(userData, { recursive: true })
  copyFileSync(source, join(userData, `${STORE_NAME}.json`))
  return source
}

const getStore = () => {
  if (!store) {
    try {
      adoptedFrom = adoptLegacyData()
    } catch {
      adoptedFrom = null
    }
    store = new Store({ name: STORE_NAME })
    migrate(store)
  }
  return store
}

export const getAdoptedFrom = () => {
  getStore()
  return adoptedFrom
}

function migrate(st) {
  if (st.get('schemaVersion') === SCHEMA_VERSION) return
  if (V1_KEYS.some((k) => st.has(k))) {
    const v1 = Object.fromEntries(V1_KEYS.map((k) => [k, st.get(k)]))
    const next = migrateV1(v1)
    // Keep an untouched copy of the old data, just in case.
    st.set('_v1Backup', v1)
    st.set('general', next.general)
    st.set('modules', next.modules)
    st.set('data', next.data)
    for (const k of V1_KEYS) st.delete(k)
    migrationInfo = { from: 1, to: SCHEMA_VERSION }
  }
  // v2 -> v3: the tasks moved out of the Pomodoro into their own module.
  const legacyTasks = st.get('data.pomodoro.tasks')
  if (Array.isArray(legacyTasks)) {
    if (!st.has('data.tasks.items')) st.set('data.tasks.items', legacyTasks)
    st.set('_v2Backup', { ...(st.get('_v2Backup') ?? {}), tasks: legacyTasks })
    st.delete('data.pomodoro.tasks')
    migrationInfo ??= { from: 2, to: SCHEMA_VERSION }
  }
  st.set('schemaVersion', SCHEMA_VERSION)
}

export const getMigrationInfo = () => {
  getStore()
  return migrationInfo
}

export const getConfig = () => {
  const st = getStore()
  return buildConfig({ general: st.get('general'), modules: st.get('modules') }, MANIFESTS)
}

export const setGeneral = (patch) => {
  const next = mergeDeep(getConfig().general, patch ?? {})
  getStore().set('general', next)
  return next
}

// patch: { enabled?, settings?, widget? } — nested objects are merged.
export const setModule = (id, patch) => {
  const current = getConfig().modules[id]
  if (!current) throw new Error(`Unknown module: ${id}`)
  const next = {
    enabled: typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled,
    settings: mergeDeep(current.settings, patch?.settings),
    widget: mergeDeep(current.widget, patch?.widget)
  }
  getStore().set(`modules.${id}`, next)
  return next
}

// Per-module data (tasks, history, habits...).
export const getData = (moduleId, key, fallback) => getStore().get(`data.${moduleId}.${key}`, fallback)
export const setData = (moduleId, key, value) => getStore().set(`data.${moduleId}.${key}`, value)
export const hasStoreKey = (key) => getStore().has(key)

// Sync engine state (server, token, what was last synced). Kept apart from the
// config so it never reaches the renderer.
export const getSyncState = () => getStore().get('sync', null)
export const setSyncState = (value) => getStore().set('sync', value)
