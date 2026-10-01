import { on } from '../lib/ipc'
import { playChime, playSoftChime } from '../lib/sound'

// The hidden host window: it only plays sounds for the main process.
export default function startHost() {
  window.__sounds = 0
  on('host:sound', (kind) => {
    window.__sounds++
    if (kind === 'soft') playSoftChime()
    else playChime()
  })
}
