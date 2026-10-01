// End-to-end: the desktop sync engine (src/main/sync.js) on several simulated
// devices, all talking to the Worker running locally.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startLocalServer } from './local-server.js'
import { createSyncEngine } from '../../src/main/sync.js'
import { applyListDocs, applyLogDocs, groupByCollection, listToDocs, logToDocs } from '../../src/shared/syncDocs.js'

let server
before(async () => {
  server = await startLocalServer({ token: 'engine-token' })
})
after(() => server?.stop())

// A fake Nomos with two modules that sync the same way the real ones do.
function device(name, { habits = [], log = {}, tasks = [] } = {}) {
  const data = { habits, log, tasks }
  const enabled = { habits: true, pomodoro: true }
  const modules = {
    habits: {
      collections: ['habits', 'habitLog'],
      exportDocs: () => ({ habits: listToDocs(data.habits, { order: true }), habitLog: logToDocs(data.log) }),
      importDocs(changes) {
        const g = groupByCollection(changes)
        if (g.habits) data.habits = applyListDocs(data.habits, g.habits, { order: true })
        if (g.habitLog) data.log = applyLogDocs(data.log, g.habitLog)
      }
    },
    pomodoro: {
      collections: ['tasks'],
      exportDocs: () => ({ tasks: listToDocs(data.tasks, { order: true }) }),
      importDocs(changes) {
        data.tasks = applyListDocs(data.tasks, changes, { order: true })
      }
    }
  }
  let saved = null
  const engine = createSyncEngine({
    loadState: () => saved,
    saveState: (s) => (saved = structuredClone(s)),
    getSyncables: () => Object.entries(modules).filter(([id]) => enabled[id]).map(([, m]) => m),
    encryptToken: (t) => `enc:${t}`,
    decryptToken: (t) => t.slice(4),
    broadcast: () => {},
    log: () => {}
  })
  engine.start()
  return { name, data, enabled, engine, sync: () => engine.syncNow(), connect: () => engine.connect(server.url, server.token) }
}

const tick = () => new Promise((r) => setTimeout(r, 5))
const strip = (d) => JSON.parse(JSON.stringify({ habits: d.habits, log: d.log, tasks: d.tasks }))

test('a wrong token or address is rejected', async () => {
  const d = device('x')
  await assert.rejects(d.engine.connect(server.url, 'nope'), /Token incorrecto/)
  await assert.rejects(d.engine.connect('http://example.com', 'x'), /https/)
  assert.equal(d.engine.status().connected, false)
  d.engine.stop()
})

test('two devices converge', async (t) => {
  const A = device('A', {
    habits: [{ id: 'h1', name: 'Agua' }, { id: 'h2', name: 'Leer' }],
    log: { '2026-10-01': { h1: 3 } },
    tasks: [{ id: 't1', title: 'Informe' }]
  })
  const B = device('B')
  t.after(() => (A.engine.stop(), B.engine.stop()))

  await A.connect()
  assert.equal(A.engine.status().state, 'ok')
  await B.connect()
  assert.deepEqual(strip(B.data), strip(A.data), 'B downloads everything')

  // B marks a habit and adds a task; A picks it up.
  B.data.log = { ...B.data.log, '2026-10-01': { ...B.data.log['2026-10-01'], h2: 1 } }
  B.data.tasks = [...B.data.tasks, { id: 't2', title: 'Café' }]
  await B.sync()
  await A.sync()
  assert.equal(A.data.log['2026-10-01'].h2, 1)
  assert.deepEqual(A.data.tasks.map((x) => x.id), ['t1', 't2'])

  // Nothing changed: nothing is sent again.
  assert.equal(await A.engine.debug.pushLocal(), 0)

  // Both rename the same habit: the later push wins everywhere.
  A.data.habits = A.data.habits.map((h) => (h.id === 'h1' ? { ...h, name: 'Agua (A)' } : h))
  await A.sync()
  await tick()
  B.data.habits = B.data.habits.map((h) => (h.id === 'h1' ? { ...h, name: 'Agua (B)' } : h))
  await B.sync()
  await A.sync()
  assert.equal(A.data.habits.find((h) => h.id === 'h1').name, 'Agua (B)')
  assert.deepEqual(strip(A.data), strip(B.data))

  // Reordering travels too.
  A.data.habits = [A.data.habits[1], A.data.habits[0]]
  await A.sync()
  await B.sync()
  assert.deepEqual(B.data.habits.map((h) => h.id), ['h2', 'h1'])

  // Deletes: a habit, a log cell and a task.
  A.data.habits = A.data.habits.filter((h) => h.id !== 'h2')
  A.data.log = { '2026-10-01': { h1: 3 } }
  A.data.tasks = A.data.tasks.filter((x) => x.id !== 't1')
  await A.sync()
  await B.sync()
  assert.deepEqual(B.data.habits.map((h) => h.id), ['h1'])
  assert.deepEqual(B.data.log, { '2026-10-01': { h1: 3 } })
  assert.deepEqual(B.data.tasks.map((x) => x.id), ['t2'])
  assert.deepEqual(strip(A.data), strip(B.data))
})

test('a new device: the server wins, local-only data is uploaded', async (t) => {
  const C = device('C', {
    habits: [{ id: 'h1', name: 'Agua local' }, { id: 'h9', name: 'Solo en C' }],
    tasks: []
  })
  const D = device('D')
  t.after(() => (C.engine.stop(), D.engine.stop()))
  await C.connect()
  assert.equal(C.data.habits.find((h) => h.id === 'h1').name, 'Agua (B)', 'server version kept')
  assert.ok(C.data.habits.some((h) => h.id === 'h9'), 'local-only habit kept')
  await D.connect()
  assert.ok(D.data.habits.some((h) => h.id === 'h9'), 'and uploaded')
})

test('a module switched off catches up when switched back on', async (t) => {
  const E = device('E')
  const F = device('F')
  t.after(() => (E.engine.stop(), F.engine.stop()))
  await E.connect()
  await F.connect()
  F.enabled.pomodoro = false
  E.data.tasks = [...E.data.tasks, { id: 't3', title: 'Mientras F no miraba' }]
  await E.sync()
  await F.sync()
  assert.ok(!F.data.tasks.some((x) => x.id === 't3'), 'not applied while off')
  // Turning a module off must not delete its data on the server.
  await E.sync()
  assert.ok(E.data.tasks.some((x) => x.id === 't3'))
  F.enabled.pomodoro = true
  await F.sync()
  assert.ok(F.data.tasks.some((x) => x.id === 't3'), 'caught up after turning it on')
})

test('disconnect keeps local data and stops syncing', async () => {
  const G = device('G')
  await G.connect()
  const before = strip(G.data)
  const st = G.engine.disconnect()
  assert.equal(st.connected, false)
  assert.deepEqual(strip(G.data), before)
  G.engine.stop()
})
