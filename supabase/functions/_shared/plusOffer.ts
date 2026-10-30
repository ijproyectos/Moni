// The ONE server-side definition of what Moni Plus costs. Used by plus-subscription (to create the subscription) and
// mp-webhook (to check that what Mercado Pago charged equals the offer). Pure TypeScript, no Deno imports, so Vitest
// covers it. The browser never sends or influences any of these values.

export interface SubscriptionOffer {
  readonly reason: string
  readonly frequency: number
  readonly frequencyType: 'months'
  readonly amount: number
  readonly currency: 'ARS'
}

/** Trusted offer catalog. Keys are internal; the request body never selects or overrides an offer. */
export const SUBSCRIPTION_OFFERS = {
  'moni-plus-monthly': {
    reason: 'Moni Plus',
    frequency: 1,
    frequencyType: 'months',
    amount: 2999,
    currency: 'ARS',
  },
} as const satisfies Record<string, SubscriptionOffer>

export const PLUS_OFFER: SubscriptionOffer = SUBSCRIPTION_OFFERS['moni-plus-monthly']

/** `auto_recurring` exactly as Mercado Pago's POST /preapproval expects it (per the Subscriptions guide). */
export function buildAutoRecurring(offer: SubscriptionOffer = PLUS_OFFER) {
  return {
    frequency: offer.frequency,
    frequency_type: offer.frequencyType,
    transaction_amount: offer.amount,
    currency_id: offer.currency,
  }
}

/** True when a charged amount and currency equal the offer. Amounts compare in cents to avoid float noise. */
export function matchesOffer(
  amount: unknown,
  currency: unknown,
  offer: SubscriptionOffer = PLUS_OFFER,
): boolean {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return false
  if (typeof currency !== 'string' || currency.toUpperCase() !== offer.currency) return false
  return Math.round(amount * 100) === Math.round(offer.amount * 100)
}
