import { useEffect, useState } from 'react'
import { invoke, on } from '../lib/ipc'

const hexToRgbChannels = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return '249 115 22'
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

// App config (general + modules), kept in sync with the main process.
// Also applies the theme and accent color to the document.
export default function useConfig() {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    let alive = true
    invoke('config:get').then((c) => alive && setConfig(c))
    const off = on('config:changed', setConfig)
    return () => {
      alive = false
      off()
    }
  }, [])

  const theme = config?.general.theme
  const accent = config?.general.accent
  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-rgb', hexToRgbChannels(accent))
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, accent])

  return config
}
