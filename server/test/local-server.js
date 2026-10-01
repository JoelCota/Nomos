// Starts the Worker with `wrangler dev` and a throw-away local D1 database.
// Used by the tests; can also be run by hand: `node test/local-server.js [port] [token]`.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const wrangler = join(serverDir, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }

export async function startLocalServer({ port = 8790 + Math.floor(Math.random() * 200), token = 'test-token' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-d1-'))
  execFileSync(wrangler, ['d1', 'migrations', 'apply', 'nomos', '--local', '--persist-to', dir], { cwd: serverDir, env, stdio: 'ignore', shell: process.platform === 'win32' })
  const child = spawn(
    wrangler,
    ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', dir, '--var', `NOMOS_TOKEN:${token}`],
    { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
  )
  const url = `http://127.0.0.1:${port}`
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('wrangler dev did not start in 60 s')), 60000)
    const onData = (chunk) => {
      if (String(chunk).includes('Ready on')) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => reject(new Error(`wrangler dev exited (${code})`)))
  })
  return {
    url,
    token,
    stop() {
      child.kill()
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await startLocalServer({ port: Number(process.argv[2]) || 8787, token: process.argv[3] || 'dev-token' })
  console.log(`Nomos API local en ${s.url} (token: ${s.token}). Ctrl+C para salir.`)
  process.on('SIGINT', () => (s.stop(), process.exit(0)))
  process.on('SIGTERM', () => (s.stop(), process.exit(0)))
}
