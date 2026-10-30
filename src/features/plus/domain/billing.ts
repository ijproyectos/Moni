// Moni Plus billing rules the UI needs. The SERVER is the source of truth for the offer (supabase/functions/
// _shared/plusOffer.ts: reason, amount, currency, frequency). Nothing here is sent to the server.

import { isPlusActive } from './plus'

/** DISPLAY ONLY. The amount actually charged is the server-side constant; changing this does not change the price. */
export const PLUS_PRICE_DISPLAY = {
  amount: 2999,
  perMonth: '$2.999/mes',
} as const

export const SUBSCRIBE_LABEL = `Suscribirme · ${PLUS_PRICE_DISPLAY.perMonth}`

export type SubscriptionState = 'none' | 'pending' | 'authorized' | 'paused' | 'cancelled'

const STATES: readonly string[] = ['none', 'pending', 'authorized', 'paused', 'cancelled']

/** Reads the `get` / lifecycle response. Anything unexpected is rejected (null), never guessed. */
export function parseSubscriptionState(data: unknown): SubscriptionState | null {
  if (typeof data !== 'object' || data === null) return null
  const { status } = data as { status?: unknown }
  return typeof status === 'string' && STATES.includes(status)
    ? (status as SubscriptionState)
    : null
}

/** A subscription that will charge again (or can be resumed): the one the person can cancel from Profile. */
export function isCancellable(state: SubscriptionState | undefined): boolean {
  return state === 'authorized' || state === 'paused'
}

/** https URL on mercadopago.com / mercadopago.com.ar (or a subdomain), no credentials, default port. */
export function isMercadoPagoUrl(value: unknown): value is string {
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

/**
 * Did this payment activate Plus? `baseline` is the expiry the person had BEFORE going to Mercado Pago:
 * undefined = unknown (any active Plus counts), null / past = they were Free, otherwise the new expiry must be later.
 */
export function isActivated(
  baseline: string | null | undefined,
  current: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!current || !isPlusActive(current, now)) return false
  if (baseline === undefined || baseline === null || !isPlusActive(baseline, now)) return true
  return Date.parse(current) > Date.parse(baseline)
}

/** Polling schedule of the return page: waits (ms) between status checks. After the last one we stop and explain. */
export const ACTIVATION_BACKOFF_MS = [2000, 4000, 8000, 15000, 30000] as const

export type ThanksPhase = 'initializing' | 'processing' | 'success' | 'delayed' | 'error'

export interface ThanksInput {
  statusLoading: boolean
  statusFailed: boolean
  activated: boolean
  subscription: SubscriptionState | undefined
  attempt: number
}

/** The single state the return page shows. */
export function thanksPhase(input: ThanksInput): ThanksPhase {
  if (input.activated) return 'success'
  if (input.statusLoading) return 'initializing'
  if (input.statusFailed) return 'error'
  if (input.subscription === 'cancelled') return 'error'
  if (input.attempt >= ACTIVATION_BACKOFF_MS.length) return 'delayed'
  return 'processing'
}
