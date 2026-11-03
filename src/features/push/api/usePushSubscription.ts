import { useCallback, useEffect, useState } from 'react'
import { detectPushSupport, type PushEnvironment } from '../domain/push'
import { ensurePushSubscription } from './ensurePushSubscription'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'working'

/** The VAPID public key the app subscribes with; empty when push is not configured for this build. */
export function getVapidPublicKey(): string {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  return typeof key === 'string' ? key.trim() : ''
}

function readEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    standalone:
      nav.standalone === true ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches),
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
  }
}

export interface PushSubscriptionApi {
  state: PushState
  /** iPhone / iPad outside an installed PWA: web push only works after "Agregar a pantalla de inicio". */
  needsInstall: boolean
  /** Call from a user gesture (a tap): it asks for the notification permission. Rejects on failure. */
  enable: () => Promise<void>
}

/**
 * Web push is always on. There is deliberately no way to turn it off from the app:
 *   - with the permission already granted, opening the app (re)subscribes this device on its own;
 *   - without it, `enable()` (a tap) asks the browser for the permission.
 * The browser cannot be forced: if the person blocks notifications in the device settings, nothing can be sent.
 */
export function usePushSubscription(): PushSubscriptionApi {
  const [support] = useState(() => detectPushSupport(readEnvironment(), navigator.maxTouchPoints))
  const [state, setState] = useState<PushState>(() =>
    support === 'available' ? 'off' : support === 'denied' ? 'denied' : 'unsupported',
  )

  // Permission already granted: keep this device subscribed (renews an expired or outdated subscription).
  useEffect(() => {
    const key = getVapidPublicKey()
    if (support !== 'available' || !key || Notification.permission !== 'granted') return
    let cancelled = false
    void ensurePushSubscription(key)
      .then(() => {
        if (!cancelled) setState('on')
      })
      .catch(() => {
        // Stays off; the next app start tries again.
      })
    return () => {
      cancelled = true
    }
  }, [support])

  const enable = useCallback(async () => {
    const key = getVapidPublicKey()
    if (support !== 'available' || !key) return
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      await ensurePushSubscription(key)
      setState('on')
    } catch (error) {
      // A browser subscription without its server row heals on the next app start (ensurePushSubscription).
      setState('off')
      throw error
    }
  }, [support])

  return { state, needsInstall: support === 'needs_install', enable }
}
