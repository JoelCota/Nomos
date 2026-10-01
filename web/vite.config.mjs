// The phone app (PWA). Built into server/public, which the Worker serves.
//   npm run build:web    (from the project root)
//   npm run dev:web      (local dev; pair it with `node server/test/local-server.js 8787 dev-token`)
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname)

export default defineConfig({
  root: here,
  plugins: [react()],
  css: { postcss: resolve(here, 'postcss.config.cjs') },
  build: {
    outDir: resolve(here, '../server/public'),
    emptyOutDir: true,
    target: 'safari15'
  },
  server: {
    port: 5180,
    proxy: { '/api': 'http://127.0.0.1:8787' }
  }
})
