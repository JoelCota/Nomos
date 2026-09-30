import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, statSync, writeFileSync } from 'fs'

const LOG_MAX_BYTES = 1024 * 1024
const logPath = () => join(app.getPath('userData'), 'debug.log')

export const log = (...parts) => {
  try {
    appendFileSync(logPath(), `${new Date().toISOString()} ${parts.join(' ')}\n`)
  } catch {
    /* ignore */
  }
}

export const trimLog = () => {
  try {
    if (statSync(logPath()).size > LOG_MAX_BYTES) writeFileSync(logPath(), '')
  } catch {
    /* no log yet */
  }
}
