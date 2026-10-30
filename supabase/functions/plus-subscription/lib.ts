// Pure logic of the plus-subscription Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// The HTTP, Supabase and Mercado Pago calls live in index.ts.

import { MP_CANCEL_STATUS } from '../_shared/mpCancel.ts'
import { buildAutoRecurring, PLUS_OFFER } from '../_shared/plusOffer.ts'

// ---------------------------------------------------------------------------------------------------------
// Request

export const ACTIONS = ['create', 'get', 'pause', 'reactivate', 'cancel'] as const
export type PlusAction = (typeof ACTIONS)[number]

export const MAX_BODY_BYTES = 1024

export type ParsedRequest = { ok: true; action: PlusAction } | { ok: false }

/** Only `{ action }` is read from the body. Price, currency, email, ids and status can never come from the browser. */
export function parseRequest(body: unknown): ParsedRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
  const { action } = body as { action?: unknown }
  if (typeof action !== 'string') return { ok: false }
  return (ACTIONS as readonly string[]).includes(action)
    ? { ok: true, action: action as PlusAction }
    : { ok: false }
}

// ---------------------------------------------------------------------------------------------------------
// Statuses

export type SubscriptionStatus = 'pending' | 'authorized' | 'paused' | 'cancelled'

/**
 * Value first sent to Mercado Pago to cancel (`canceled`, as in the Subscriptions guide shipped with the Mercado
 * Pago plugin). NOT verified against the live API reference: on a 400 the call is retried once with `cancelled`
 * and the working spelling is remembered (see _shared/mpCancel.ts). Reads accept both spellings (statusFromMp).
 */
export { MP_CANCEL_STATUS }

/** Maps a Mercado Pago preapproval status to ours. Unknown values return null (never guess). */
export function statusFromMp(value: unknown): SubscriptionStatus | null {
  switch (value) {
    case 'pending':
    case 'authorized':
    case 'paused':
      return value
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return null
  }
}

export type LifecycleAction = 'pause' | 'reactivate' | 'cancel'

/** Allowlist: the browser sends an action, never a status. */
export const LIFECYCLE: Record<
  LifecycleAction,
  { mpStatus: string; from: readonly SubscriptionStatus[]; to: SubscriptionStatus }
> = {
  pause: { mpStatus: 'paused', from: ['authorized'], to: 'paused' },
  reactivate: { mpStatus: 'authorized', from: ['paused'], to: 'authorized' },
  cancel: {
    mpStatus: MP_CANCEL_STATUS,
    from: ['pending', 'authorized', 'paused'],
    to: 'cancelled',
  },
}

export function isLifecycleAction(action: PlusAction): action is LifecycleAction {
  return action === 'pause' || action === 'reactivate' || action === 'cancel'
}

export function canTransition(action: LifecycleAction, current: SubscriptionStatus): boolean {
  return LIFECYCLE[action].from.includes(current)
}

export interface SubscriptionRow {
  id: string
  preapproval_id: string | null
  status: SubscriptionStatus
  created_at: string
}

/**
 * Older checkouts of the same user that must be cancelled on Mercado Pago before a new preapproval is created:
 * `pending` rows (other than the new one) that already have a preapproval id. Without this, an abandoned checkout
 * could still be completed later and bill the user twice.
 */
export function selectStalePending(
  rows: readonly SubscriptionRow[],
  newId: string,
): SubscriptionRow[] {
  return rows.filter((r) => r.id !== newId && r.status === 'pending' && r.preapproval_id !== null)
}

/** Every non-cancelled row of the user: the `cancel` action cancels all of them, not just the current one. */
export function selectCancelTargets(rows: readonly SubscriptionRow[]): SubscriptionRow[] {
  return rows.filter((r) => r.status !== 'cancelled')
}

/** Minimum seconds between two Mercado Pago reads of the same subscription (`get` action). */
export const SYNC_MIN_SECONDS = 15
/** Minimum seconds between two Mercado Pago writes (pause / reactivate / cancel) of the same user. */
export const WRITE_MIN_SECONDS = 5

/** Stable error for a pause / reactivate / cancel sent right after another write of the same user. */
export const ACTION_THROTTLED: ApiFailure = { http: 429, code: 'action_throttled' }

const PRIORITY: Record<SubscriptionStatus, number> = {
  authorized: 3,
  paused: 2,
  pending: 1,
  cancelled: 0,
}

/**
 * The subscription the user is "on": the one that is authorized, else paused, else the newest pending, else the
 * newest cancelled. Rows without a preapproval_id (checkout never reached Mercado Pago) are ignored.
 */
export function pickCurrentSubscription(rows: readonly SubscriptionRow[]): SubscriptionRow | null {
  const usable = rows.filter((r) => r.preapproval_id !== null)
  if (usable.length === 0) return null
  const [best] = [...usable].sort(
    (a, b) =>
      PRIORITY[b.status] - PRIORITY[a.status] ||
      Date.parse(b.created_at) - Date.parse(a.created_at),
  )
  return best ?? null
}

// ---------------------------------------------------------------------------------------------------------
// back_url

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
export const THANKS_PATH = '/plus/gracias'

/**
 * back_url for Mercado Pago: APP_URL's origin + /plus/gracias. HTTPS is required; plain HTTP is accepted only for
 * localhost (local development). Returns null for anything else (missing, malformed, credentials, other schemes).
 */
export function buildBackUrl(appUrl: string | undefined | null): string | null {
  if (!appUrl) return null
  let url: URL
  try {
    url = new URL(appUrl.trim())
  } catch {
    return null
  }
  if (url.username !== '' || url.password !== '') return null
  const local = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
  return `${url.origin}${THANKS_PATH}`
}

// ---------------------------------------------------------------------------------------------------------
// Preapproval request / response

const TEST_PAYER_EMAIL = /^[a-z0-9._+-]{1,64}@testuser\.com$/i

/**
 * Payer email sent to Mercado Pago. It is always the authenticated user's email, with ONE test-only exception:
 * while the application runs with a TEST seller (collector), Mercado Pago rejects a real payer ("Both payer and
 * collector must be real or test users"), so the optional MP_TEST_PAYER_EMAIL secret may replace it. Only an
 * address on Mercado Pago's own test domain (@testuser.com) is honoured; anything else is ignored, so the
 * override can never point billing at an arbitrary real address and does nothing once real credentials are used.
 */
export function resolvePayerEmail(
  userEmail: string,
  testOverride: string | undefined | null,
): { email: string; overridden: boolean } {
  const candidate = testOverride?.trim()
  if (candidate && TEST_PAYER_EMAIL.test(candidate)) return { email: candidate, overridden: true }
  return { email: userEmail, overridden: false }
}

export interface PreapprovalInput {
  externalReference: string
  payerEmail: string
  backUrl: string
}

/** Body of POST https://api.mercadopago.com/preapproval for the `without-plan-pending` contract. */
export function buildPreapprovalBody(input: PreapprovalInput) {
  return {
    reason: PLUS_OFFER.reason,
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    auto_recurring: buildAutoRecurring(),
    back_url: input.backUrl,
    status: 'pending' as const,
  }
}

export function preapprovalUrl(id: string): string {
  return `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`
}

/** https URL on mercadopago.com or mercadopago.com.ar (or a subdomain), no credentials, default port. */
export function isMercadoPagoInitPoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '' || url.port !== '') return false
  return /^(?:[a-z0-9-]+\.)*mercadopago\.com(?:\.ar)?$/.test(url.hostname)
}

export interface PreapprovalResource {
  id: string
  status: SubscriptionStatus | null
  initPoint: string | null
}

/** Reads only the fields we use from a Mercado Pago preapproval; anything else is dropped. */
export function parsePreapproval(json: unknown): PreapprovalResource | null {
  if (typeof json !== 'object' || json === null) return null
  const { id, status, init_point } = json as Record<string, unknown>
  if (typeof id !== 'string' || id === '' || id.length > 100) return null
  return {
    id,
    status: statusFromMp(status),
    initPoint: typeof init_point === 'string' ? init_point : null,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Errors

export interface ApiFailure {
  http: number
  code: string
}

/** Maps a failure of our own database functions (start_plus_subscription) to a stable API error. */
export function classifyRpcError(error: { message?: string; code?: string } | null): ApiFailure {
  const message = error?.message ?? ''
  if (message.includes('already_subscribed')) return { http: 409, code: 'already_subscribed' }
  if (message.includes('create_throttled')) return { http: 429, code: 'too_many_requests' }
  return { http: 500, code: 'server_error' }
}

/** Maps a Mercado Pago HTTP status (0 = network error / timeout) to a stable API error. Bodies are never exposed. */
export function classifyMpFailure(status: number): ApiFailure {
  if (status === 0 || status === 429 || status >= 500) {
    return { http: 502, code: 'payment_provider_unavailable' }
  }
  return { http: 502, code: 'payment_provider_error' }
}

/** Extracts the user-visible part of the subscription state. Never includes ids or Mercado Pago data. */
export function publicState(row: SubscriptionRow | null): { status: SubscriptionStatus | 'none' } {
  return { status: row ? row.status : 'none' }
}
