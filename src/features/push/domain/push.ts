/** Pure helpers for web push: key conversion, support detection and the RPC arguments of a subscription. */

/** Decodes a base64url VAPID public key into the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export interface PushEnvironment {
  userAgent: string
  /** Running as an installed PWA (display-mode: standalone or iOS navigator.standalone). */
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  permission: NotificationPermission | null
}

/**
 * - `unsupported`: this browser cannot receive push.
 * - `needs_install`: iPhone / iPad only deliver web push to an installed PWA ("Agregar a pantalla de inicio").
 * - `denied`: the person blocked notifications in the browser settings; the app cannot ask again.
 * - `available`: can be turned on.
 */
export type PushSupport = 'unsupported' | 'needs_install' | 'denied' | 'available'

export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ reports a desktop Mac user agent, but has touch points.
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function detectPushSupport(env: PushEnvironment, maxTouchPoints = 0): PushSupport {
  // On iOS the push APIs only exist for an installed PWA, so check the install hint before API presence.
  if (isIos(env.userAgent, maxTouchPoints) && !env.standalone) return 'needs_install'
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported'
  if (env.permission === 'denied') return 'denied'
  return 'available'
}

export interface RegisterPushArgs {
  p_endpoint: string
  p_p256dh: string
  p_auth: string
  p_user_agent: string
}

/** Arguments of `register_push_subscription`, or null when the subscription lacks its endpoint or keys. */
export function subscriptionToRpcArgs(
  subscription: PushSubscriptionJSON,
  userAgent: string,
): RegisterPushArgs | null {
  const endpoint = subscription.endpoint
  const p256dh = subscription.keys?.p256dh
  const auth = subscription.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent.slice(0, 512),
  }
}
