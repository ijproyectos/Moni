// Test helper: fakes the browser push surface (service worker, PushManager, Notification).
import { vi } from 'vitest'

export interface FakePush {
  subscription: {
    endpoint: string
    expirationTime: number | null
    options: { applicationServerKey: ArrayBuffer | null }
    toJSON: () => unknown
    unsubscribe: ReturnType<typeof vi.fn>
  }
  subscribe: ReturnType<typeof vi.fn>
  getSubscription: ReturnType<typeof vi.fn>
  requestPermission: ReturnType<typeof vi.fn>
  restore: () => void
}

export function installFakePush(options: {
  permission?: NotificationPermission
  requestResult?: NotificationPermission
  existing?: boolean
  /** Epoch ms the existing subscription expires at (default: never). */
  expirationTime?: number | null
  /** Key the existing subscription was made with (default: the test VAPID key 'SGk'). */
  existingKey?: Uint8Array
  userAgent?: string
  standalone?: boolean
}): FakePush {
  const subscription = {
    endpoint: 'https://push.example.com/abc',
    expirationTime: options.expirationTime ?? null,
    options: {
      applicationServerKey: (options.existingKey ?? new Uint8Array([72, 105]))
        .buffer as ArrayBuffer,
    },
    toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  const getSubscription = vi.fn().mockResolvedValue(options.existing ? subscription : null)
  const subscribe = vi.fn().mockResolvedValue(subscription)
  const requestPermission = vi.fn().mockResolvedValue(options.requestResult ?? 'granted')

  const defined: Array<[object, string]> = []
  const define = (target: object, key: string, value: unknown) => {
    Object.defineProperty(target, key, { configurable: true, writable: true, value })
    defined.push([target, key])
  }
  define(navigator, 'serviceWorker', {
    ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }),
  })
  define(window, 'PushManager', function PushManager() {})
  define(window, 'Notification', { permission: options.permission ?? 'default', requestPermission })
  if (options.userAgent) define(navigator, 'userAgent', options.userAgent)
  if (options.standalone !== undefined) define(navigator, 'standalone', options.standalone)

  return {
    subscription,
    subscribe,
    getSubscription,
    requestPermission,
    restore: () => {
      for (const [target, key] of defined) Reflect.deleteProperty(target, key)
    },
  }
}
