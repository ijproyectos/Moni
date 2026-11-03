import { needsResubscribe, subscriptionToRpcArgs, urlBase64ToUint8Array } from '../domain/push'
import { registerPushSubscription } from './pushRepository'

let inFlight: Promise<void> | null = null

/**
 * Makes sure this device has a live push subscription registered on the server. Call it only once the notification
 * permission is granted: nothing here asks for it. Idempotent and safe to call on every app start:
 *   - no subscription        -> subscribe;
 *   - expired / old VAPID key -> replace it (renewal, never an opt-out);
 *   - healthy                -> just refresh the server row.
 * Concurrent calls share one run.
 */
export function ensurePushSubscription(vapidPublicKey: string): Promise<void> {
  inFlight ??= run(vapidPublicKey).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(vapidPublicKey: string): Promise<void> {
  const key = urlBase64ToUint8Array(vapidPublicKey)
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && needsResubscribe(subscription, key, Date.now())) {
    await subscription.unsubscribe().catch(() => undefined)
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  })
  const args = subscriptionToRpcArgs(subscription.toJSON(), navigator.userAgent)
  if (!args) throw new Error('incomplete_subscription')
  await registerPushSubscription(args)
}
