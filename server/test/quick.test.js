// Siri / Atajos endpoints and the shortcut key.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startLocalServer } from './local-server.js'

const OWNER = 'quick-owner'
let server
let phone
let shortcut
before(async () => {
  server = await startLocalServer({ token: OWNER })
})
after(() => server?.stop())

const call = async (method, path, body, token = OWNER) => {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { status: res.status, body: await res.json() }
}
const docs = async () => (await call('GET', '/api/sync?since=0')).body.docs

test('a phone creates a key for Atajos; it shows up and can be revoked', async () => {
  const code = (await call('POST', '/api/pair/start')).body.code
  phone = (await call('POST', '/api/pair/claim', { code, name: 'iPhone' }, null)).body
  assert.equal((await call('POST', '/api/device/shortcut-key')).status, 403, 'only from a phone')
  const r = await call('POST', '/api/device/shortcut-key', null, phone.token)
  assert.equal(r.status, 200)
  shortcut = r.body
  assert.equal(shortcut.device.name, 'Atajos de Siri (iPhone)')
  const list = (await call('GET', '/api/devices')).body.devices.map((d) => [d.name, d.notify])
  assert.deepEqual(list, [['iPhone', 'always'], ['Atajos de Siri (iPhone)', 'never']])
})

test('add a task by voice', async () => {
  await call('POST', '/api/sync', { device: 'pc', changes: [{ collection: 'tasks', id: 'old', data: { title: 'Vieja', done: false, order: 4 }, updatedAt: Date.now() }] })
  const r = await call('POST', '/api/quick/task', { title: '  comprar café para la oficina. ' }, shortcut.token)
  assert.equal(r.status, 200)
  assert.equal(r.body.message, 'Listo, agregué «comprar café para la oficina» a tus tareas.')
  const t = (await docs()).find((d) => d.collection === 'tasks' && d.data?.title === 'comprar café para la oficina')
  assert.ok(t)
  assert.equal(t.data.order, 5, 'goes to the end of the list')
  assert.equal(t.data.done, false)
  const empty = await call('POST', '/api/quick/task', { title: '   ' }, shortcut.token)
  assert.equal(empty.status, 400)
  assert.equal(empty.body.message, 'Dime el nombre de la tarea.', 'errors have a message too')
  assert.equal((await call('POST', '/api/quick/task', { title: 'x' }, 'bad')).status, 401)
})

test('mark habits by voice and ask how today is going', async () => {
  const now = Date.now()
  const H = (i, d) => ({ createdDay: '2026-01-01', frequency: { kind: 'daily' }, order: i, ...d })
  await call('POST', '/api/sync', {
    device: 'pc',
    changes: [
      { collection: 'habitSettings', id: 'main', data: { tz: 'America/Mazatlan', dayStartHour: 0 }, updatedAt: now },
      { collection: 'habits', id: 'agua', data: H(0, { name: 'Tomar agua', icon: '💧', type: 'count', target: 8 }), updatedAt: now },
      { collection: 'habits', id: 'leer', data: H(1, { name: 'Leer', icon: '📖', type: 'check', target: 1 }), updatedAt: now },
      { collection: 'habits', id: 'medit', data: H(2, { name: 'Meditación', icon: '🧘', type: 'duration', target: 15 }), updatedAt: now }
    ]
  })
  const t0 = await call('GET', '/api/quick/today', null, shortcut.token)
  assert.equal(t0.body.message, 'Llevas 0 de 3 hábitos. Te faltan: Tomar agua, Leer y Meditación.')

  assert.equal((await call('POST', '/api/quick/habit', { habit: 'leer' }, shortcut.token)).body.message, 'Listo, marqué Leer.')
  assert.equal((await call('POST', '/api/quick/habit', { habit: 'Leer' }, shortcut.token)).body.message, 'Leer ya estaba hecho hoy.')
  assert.equal((await call('POST', '/api/quick/habit', { habit: 'agua' }, shortcut.token)).body.message, 'Listo: Tomar agua 1 de 8.')
  assert.equal((await call('POST', '/api/quick/habit', { habit: 'agua', amount: 7 }, shortcut.token)).body.message, 'Listo: Tomar agua 8 de 8. ¡Meta cumplida!')
  assert.equal((await call('POST', '/api/quick/habit', { habit: 'meditacion', amount: 10 }, shortcut.token)).body.message, 'Listo: Meditación 10 de 15 min.', 'accents ignored')

  const miss = await call('POST', '/api/quick/habit', { habit: 'correr' }, shortcut.token)
  assert.equal(miss.status, 404)
  assert.equal(miss.body.message, 'No encontré «correr». Tus hábitos son: Tomar agua, Leer y Meditación.')

  const t1 = await call('GET', '/api/quick/today', null, shortcut.token)
  assert.equal(t1.body.message, 'Llevas 2 de 3 hábitos. Te falta: Meditación.')

  // It's a normal synced change: the day is the PC's (Mazatlán) day.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mazatlan' }).format(new Date())
  const cell = (await docs()).find((d) => d.collection === 'habitLog' && d.id === `${day}|agua`)
  assert.equal(cell?.data.value, 8)
})

test('revoking the shortcut key stops it', async () => {
  assert.equal((await call('DELETE', `/api/devices/${shortcut.device.id}`)).status, 200)
  assert.equal((await call('GET', '/api/quick/today', null, shortcut.token)).status, 401)
  assert.equal((await call('GET', '/api/quick/today', null, phone.token)).status, 200, 'the phone keeps working')
})
