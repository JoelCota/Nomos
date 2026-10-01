// Runs the Worker with `wrangler dev` and a local D1 database: `npm test`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startLocalServer } from './local-server.js'

const TOKEN = 'test-token-123'
let server

before(async () => {
  server = await startLocalServer({ token: TOKEN })
})
after(() => server?.stop())

const call = async (method, path, body, token = TOKEN) => {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { status: res.status, body: await res.json(), headers: res.headers }
}
const pushDocs = (device, changes) => call('POST', '/api/sync', { device, changes })
const doc = (collection, id, data, updatedAt, extra = {}) => ({ collection, id, data, updatedAt, ...extra })

test('health is public and has CORS', async () => {
  const r = await call('GET', '/api/health', null, null)
  assert.equal(r.status, 200)
  assert.equal(r.body.app, 'nomos')
  assert.equal(r.headers.get('access-control-allow-origin'), '*')
})

test('the rest of the API needs the token', async () => {
  assert.equal((await call('GET', '/api/me', null, null)).status, 401)
  assert.equal((await call('GET', '/api/me', null, 'wrong')).status, 401)
  assert.equal((await call('GET', '/api/sync', null, 'test-token-12')).status, 401)
  const ok = await call('GET', '/api/me')
  assert.equal(ok.status, 200)
  assert.equal(ok.body.seq, 0)
})

test('push then pull', async () => {
  const r = await pushDocs('pc', [doc('habits', 'h1', { name: 'Agua' }, 1000), doc('tasks', 't1', { title: 'Comprar café' }, 1000)])
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.results.map((x) => x.status), ['applied', 'applied'])
  assert.equal(r.body.seq, 2)
  const p = await call('GET', '/api/sync?since=0')
  assert.deepEqual(p.body.docs.map((d) => [d.collection, d.id, d.seq]), [['habits', 'h1', 1], ['tasks', 't1', 2]])
  assert.deepEqual(p.body.docs[0].data, { name: 'Agua' })
  assert.equal(p.body.seq, 2)
  assert.equal(p.body.more, false)
  assert.equal((await call('GET', '/api/sync?since=2')).body.docs.length, 0)
})

test('last writer wins per document', async () => {
  const older = await pushDocs('phone', [doc('habits', 'h1', { name: 'Agua (viejo)' }, 500)])
  assert.equal(older.body.results[0].status, 'stale')
  assert.deepEqual(older.body.results[0].doc.data, { name: 'Agua' }, 'returns the server version')

  const newer = await pushDocs('phone', [doc('habits', 'h1', { name: 'Agua 💧' }, 2000)])
  assert.equal(newer.body.results[0].status, 'applied')
  const p = await call('GET', '/api/sync?since=2')
  assert.deepEqual(p.body.docs.map((d) => [d.id, d.data.name]), [['h1', 'Agua 💧']])

  // Same timestamp: the higher device id wins, the same way on every server.
  await pushDocs('a', [doc('notes', 'n1', { v: 'a' }, 3000)])
  const tieLow = await pushDocs('0', [doc('notes', 'n1', { v: '0' }, 3000)])
  assert.equal(tieLow.body.results[0].status, 'stale')
  const tieHigh = await pushDocs('z', [doc('notes', 'n1', { v: 'z' }, 3000)])
  assert.equal(tieHigh.body.results[0].status, 'applied')
})

test('deletes travel as tombstones', async () => {
  const seq = (await call('GET', '/api/me')).body.seq
  const r = await pushDocs('pc', [doc('tasks', 't1', null, 5000, { deleted: true })])
  assert.equal(r.body.results[0].status, 'applied')
  const p = await call('GET', `/api/sync?since=${seq}`)
  assert.deepEqual(p.body.docs.map((d) => [d.id, d.deleted, d.data]), [['t1', true, null]])
  // An older edit can't bring it back.
  const late = await pushDocs('phone', [doc('tasks', 't1', { title: 'zombie' }, 4000)])
  assert.equal(late.body.results[0].status, 'stale')
})

test('pull pages through large change sets', async () => {
  const seq = (await call('GET', '/api/me')).body.seq
  await pushDocs('pc', Array.from({ length: 7 }, (_, i) => doc('habitLog', `2026-10-01|h${i}`, { value: i }, 6000)))
  const page1 = await call('GET', `/api/sync?since=${seq}&limit=5`)
  assert.equal(page1.body.docs.length, 5)
  assert.equal(page1.body.more, true)
  const page2 = await call('GET', `/api/sync?since=${page1.body.seq}&limit=5`)
  assert.equal(page2.body.docs.length, 2)
  assert.equal(page2.body.more, false)
})

test('duplicates in one push: the last one counts', async () => {
  const r = await pushDocs('pc', [doc('tasks', 'dup', { v: 1 }, 7000), doc('tasks', 'dup', { v: 2 }, 7000)])
  assert.equal(r.body.results.length, 1)
  const p = await call('GET', `/api/sync?since=${r.body.seq - 1}`)
  assert.deepEqual(p.body.docs.find((d) => d.id === 'dup').data, { v: 2 })
})

test('a clock far in the future is capped', async () => {
  const r = await pushDocs('pc', [doc('tasks', 'future', { v: 1 }, Date.now() + 10 * 365 * 864e5)])
  assert.ok(r.body.results[0].doc.updatedAt <= Date.now() + 61000)
  assert.equal(r.body.results[0].status, 'applied')
})

test('rejects bad input', async () => {
  assert.equal((await pushDocs('pc', [doc('bad name!', 'x', {}, 1)])).status, 400)
  assert.equal((await pushDocs('pc', [doc('tasks', '', {}, 1)])).status, 400)
  assert.equal((await pushDocs('pc', [doc('tasks', 'x', [1, 2], 1)])).status, 400)
  assert.equal((await pushDocs('pc', [doc('tasks', 'x', {}, 'ayer')])).status, 400)
  assert.equal((await pushDocs('pc', [doc('tasks', 'x', { big: 'x'.repeat(20000) }, 1)])).status, 413)
  assert.equal((await pushDocs('pc', Array.from({ length: 201 }, (_, i) => doc('t', `i${i}`, {}, 1)))).status, 413)
  assert.equal((await call('POST', '/api/sync', { changes: 'nope' })).status, 400)
  const raw = await fetch(`${server.url}/api/sync`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{oops' })
  assert.equal(raw.status, 400)
  assert.equal((await call('GET', '/api/nothing')).status, 404)
})
