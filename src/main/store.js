import Store from 'electron-store'
import { MANIFESTS } from '../modules/manifests.js'
import { SCHEMA_VERSION, buildConfig, migrateV1 } from '../shared/config.js'
import { mergeDeep } from '../shared/merge.js'

const V1_KEYS = ['settings', 'tasks', 'history', 'windowBounds']

// Created lazily so the userData path can be changed (self-test) before the
// store file is opened.
let store = null
let migrationInfo = null

const getStore = () => {
  if (!store) {
    store = new Store({ name: 'pomodoro-widget' })
    migrate(store)
  }
  return store
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
