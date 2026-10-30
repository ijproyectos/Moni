import { FunctionsHttpError } from '@supabase/supabase-js'
import { assertOnline } from '@/shared/lib/offline'
import { getSupabase } from '@/shared/lib/supabase'
import { isMercadoPagoUrl, parseSubscriptionState, type SubscriptionState } from '../domain/billing'

/** Carries the Edge Function error code ("already_subscribed", ...) so `toUserMessage` can map it. */
export class BillingError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'BillingError'
  }
}

async function codeFromHttpError(error: FunctionsHttpError): Promise<string> {
  try {
    const body: unknown = await (error.context as Response).json()
    const code = (body as { error?: unknown } | null)?.error
    if (typeof code === 'string' && code !== '') return code
  } catch {
    // Body was not JSON: fall through.
  }
  return 'billing_unavailable'
}

/** Turns a failed function call into a BillingError with a stable code. */
export async function toBillingError(error: unknown): Promise<BillingError> {
  if (error instanceof FunctionsHttpError) return new BillingError(await codeFromHttpError(error))
  return new BillingError('billing_unavailable')
}

async function invoke(action: 'create' | 'get' | 'reactivate' | 'cancel'): Promise<unknown> {
  assertOnline()
  const { data, error } = await getSupabase().functions.invoke('plus-subscription', {
    body: { action },
  })
  if (error) throw await toBillingError(error)
  return data
}

/**
 * Asks the server to create the Mercado Pago subscription and returns where to send the person. The offer (price,
 * period) is decided on the server; only the action name travels. The URL is re-validated here before any redirect.
 */
export async function createCheckout(): Promise<string> {
  const data = await invoke('create')
  const initPoint = (data as { init_point?: unknown } | null)?.init_point
  if (!isMercadoPagoUrl(initPoint)) throw new BillingError('payment_provider_error')
  return initPoint
}

export async function getSubscriptionState(): Promise<SubscriptionState> {
  const state = parseSubscriptionState(await invoke('get'))
  if (!state) throw new BillingError('billing_unavailable')
  return state
}

async function lifecycle(action: 'reactivate' | 'cancel'): Promise<SubscriptionState> {
  const state = parseSubscriptionState(await invoke(action))
  if (!state) throw new BillingError('billing_unavailable')
  return state
}

/** Cancelling keeps Plus until the already-paid expiry; only future charges stop. */
export const cancelSubscription = () => lifecycle('cancel')
export const reactivateSubscription = () => lifecycle('reactivate')
