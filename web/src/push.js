// Notifications on this phone (Web Push). On iPhone they only exist when Nomos
// was added to the home screen (iOS 16.4 or later).
import { api } from './store'
import { isIOS, isStandalone } from './ui'

const fromB64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

// 'unsupported' | 'install' (iOS Safari tab) | 'denied' | 'off' | 'on'
export async function pushStatus() {
  if (isIOS() && !isStandalone()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

// Must run from a tap (iOS asks for permission only then).
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('No diste permiso para las notificaciones. Puedes activarlo en Ajustes del iPhone → Notificaciones → Nomos.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { publicKey } = await api('GET', '/api/push/key')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(publicKey) })
  await api('POST', '/api/push/subscribe', sub.toJSON())
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api('DELETE', '/api/push/subscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
