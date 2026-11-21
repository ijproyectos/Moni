// Pure logic of the revenuecat-webhook Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// RevenueCat webhook reference: https://www.revenuecat.com/docs/integrations/webhooks
// Auth: RevenueCat does not sign webhooks with HMAC. Instead it resends, verbatim on every call, whatever string
// was configured as the webhook's "Authorization" header in the RevenueCat dashboard. The function compares that
// against its own REVENUECAT_WEBHOOK_AUTH_TOKEN, constant-time.

export const MAX_BODY_BYTES = 16 * 1024

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

/** Constant-time comparison of two strings (the length of a token is not secret). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------------------------------------
// Event body

/**
 * Event types that carry an authoritative `expiration_at_ms` and should set the caller's Plus expiry to it.
 * CANCELLATION and BILLING_ISSUE still carry the current (unchanged) expiration: access runs out at that date,
 * not immediately, same as Mercado Pago's "cancel does not touch the entitlement" rule.
 */
const EXPIRY_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'CANCELLATION',
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
  'BILLING_ISSUE',
])

export interface RevenueCatEvent {
  id: string
  type: string
  appUserId: string | null
  expirationAtMs: number | null
}

/** Reads the handful of fields used here from RevenueCat's `{ event: {...} }` webhook body. */
export function parseWebhookBody(body: unknown): RevenueCatEvent | null {
  if (typeof body !== 'object' || body === null) return null
  const { event } = body as Record<string, unknown>
  if (typeof event !== 'object' || event === null) return null
  const { id, type, app_user_id, expiration_at_ms } = event as Record<string, unknown>
  if (typeof id !== 'string' || id === '' || typeof type !== 'string' || type === '') return null
  return {
    id,
    type,
    appUserId: typeof app_user_id === 'string' && app_user_id !== '' ? app_user_id : null,
    expirationAtMs:
      typeof expiration_at_ms === 'number' && Number.isFinite(expiration_at_ms)
        ? expiration_at_ms
        : null,
  }
}

// RevenueCat's app_user_id is the Supabase auth user id (the client initializes the SDK with it as appUserID).
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EventDecision =
  | { kind: 'grant'; userId: string; eventId: string; eventType: string; expiresAtIso: string }
  | { kind: 'ignore'; reason: 'test_event' | 'unsupported_type' | 'transfer_unsupported' }
  | { kind: 'unexpected_shape' }

/**
 * Decides what a parsed event means. TEST (RevenueCat dashboard's "send test webhook" button) is acknowledged and
 * does nothing. TRANSFER (moving an entitlement between app_user_id's) is intentionally unsupported for now: it has
 * a different shape (transferred_from / transferred_to arrays, no single expiration), and Moni has no product
 * reason yet to transfer a RevenueCat identity away from a Supabase user id. Anything outside EXPIRY_EVENT_TYPES is
 * ignored so RevenueCat does not keep retrying a webhook this function does not need to act on.
 */
export function decideEvent(info: RevenueCatEvent): EventDecision {
  if (info.type === 'TEST') return { kind: 'ignore', reason: 'test_event' }
  if (info.type === 'TRANSFER') return { kind: 'ignore', reason: 'transfer_unsupported' }
  if (!EXPIRY_EVENT_TYPES.has(info.type)) return { kind: 'ignore', reason: 'unsupported_type' }
  if (!info.appUserId || !USER_ID.test(info.appUserId) || info.expirationAtMs === null) {
    return { kind: 'unexpected_shape' }
  }
  return {
    kind: 'grant',
    userId: info.appUserId,
    eventId: info.id,
    eventType: info.type,
    expiresAtIso: new Date(info.expirationAtMs).toISOString(),
  }
}
