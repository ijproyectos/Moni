// Web push handlers, imported by the generated service worker (workbox.importScripts in vite.config.ts).
// Plain JS on purpose: it is served as-is from /push-sw.js.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title =
    typeof data.title === 'string' && data.title !== '' ? data.title.slice(0, 80) : 'Moni'
  const body = typeof data.body === 'string' ? data.body.slice(0, 240) : ''
  const url = typeof data.url === 'string' && isSafePath(data.url) ? data.url : '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url, kind: typeof data.kind === 'string' ? data.kind : null },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const stored = event.notification.data && event.notification.data.url
  const path = typeof stored === 'string' && isSafePath(stored) ? stored : '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin))
      if (existing) {
        return existing.focus().then((focused) => (focused || existing).navigate(target))
      }
      return self.clients.openWindow(target)
    }),
  )
})

// Only same-origin relative paths: a single leading slash, no protocol-relative form, no backslashes.
function isSafePath(value) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
