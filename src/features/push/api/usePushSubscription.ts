import { useCallback, useEffect, useState } from 'react'
import {
  detectPushSupport,
  subscriptionToRpcArgs,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from '../domain/push'
import { registerPushSubscription, removePushSubscription } from './pushRepository'

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
  disable: () => Promise<void>
}

export function usePushSubscription(): PushSubscriptionApi {
  const [support] = useState(() => detectPushSupport(readEnvironment(), navigator.maxTouchPoints))
  const [state, setState] = useState<PushState>(() =>
    support === 'available' ? 'off' : support === 'denied' ? 'denied' : 'unsupported',
  )

  // Reflect an existing subscription on this device (and refresh last_seen_at, best effort).
  useEffect(() => {
    if (support !== 'available' || Notification.permission !== 'granted') return
    let cancelled = false
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (cancelled || !existing) return
        setState('on')
        const args = subscriptionToRpcArgs(existing.toJSON(), navigator.userAgent)
        if (args) await registerPushSubscription(args).catch(() => undefined)
      } catch {
        // Stays off: the person can still turn it on.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [support])

  const enable = useCallback(async () => {
    const key = getVapidPublicKey()
    if (support !== 'available' || !key) return
    setState('working')
    let subscribed: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const registration = await navigator.serviceWorker.ready
      subscribed =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }))
      const args = subscriptionToRpcArgs(subscribed.toJSON(), navigator.userAgent)
      if (!args) throw new Error('incomplete_subscription')
      await registerPushSubscription(args)
      setState('on')
    } catch (error) {
      // Keep browser and server consistent: no local subscription without its server row.
      await subscribed?.unsubscribe().catch(() => undefined)
      setState('off')
      throw error
    }
  }, [support])

  const disable = useCallback(async () => {
    setState('working')
    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        const endpoint = existing.endpoint
        await existing.unsubscribe()
        await removePushSubscription(endpoint)
      }
      setState('off')
    } catch (error) {
      setState('on')
      throw error
    }
  }, [])

  return { state, needsInstall: support === 'needs_install', enable, disable }
}
