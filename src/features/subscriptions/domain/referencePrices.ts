// Reference prices (USD) for services that bill in dollars. SINGLE DATA FILE: update prices here and
// see docs/SUBSCRIPTION_PRICES.md. Rules: only from the service's official pricing page, with its URL and
// the date checked; a price that could not be verified is simply left out (never guessed).
// `plan` must match a plan name in catalog.ts. Prices exclude taxes and change often.

import type { SubscriptionPeriod } from './subscription'

export interface ReferencePrice {
  serviceId: string
  plan: string
  /** USD per month when billed monthly. */
  monthlyUsd?: number
  /** USD per year when billed yearly (total, not per month). */
  yearlyUsd?: number
  sourceUrl: string
  /** ISO date (YYYY-MM-DD) the source was checked. */
  checkedOn: string
}

export const REFERENCE_PRICES: readonly ReferencePrice[] = [
  {
    serviceId: 'claude',
    plan: 'Pro',
    monthlyUsd: 20,
    yearlyUsd: 200,
    sourceUrl: 'https://claude.com/pricing',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'cursor',
    plan: 'Ultra',
    monthlyUsd: 200,
    sourceUrl: 'https://cursor.com/pricing',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'github-copilot',
    plan: 'Pro',
    monthlyUsd: 10,
    sourceUrl: 'https://github.com/features/copilot/plans',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'github-copilot',
    plan: 'Pro+',
    monthlyUsd: 39,
    sourceUrl: 'https://github.com/features/copilot/plans',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'elevenlabs',
    plan: 'Starter',
    monthlyUsd: 6,
    yearlyUsd: 60,
    sourceUrl: 'https://elevenlabs.io/pricing',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'elevenlabs',
    plan: 'Creator',
    monthlyUsd: 22,
    yearlyUsd: 220,
    sourceUrl: 'https://elevenlabs.io/pricing',
    checkedOn: '2026-10-30',
  },
  {
    serviceId: 'elevenlabs',
    plan: 'Pro',
    monthlyUsd: 99,
    yearlyUsd: 990,
    sourceUrl: 'https://elevenlabs.io/pricing',
    checkedOn: '2026-10-30',
  },
]

export interface PriceHint {
  usd: number
  sourceUrl: string
  checkedOn: string
}

/** Reference USD price for the service + plan + billing period, or undefined when none is verified. */
export function referencePrice(
  serviceId: string,
  plan: string,
  period: SubscriptionPeriod,
): PriceHint | undefined {
  const entry = REFERENCE_PRICES.find((p) => p.serviceId === serviceId && p.plan === plan)
  const usd = period === 'monthly' ? entry?.monthlyUsd : entry?.yearlyUsd
  return entry && usd !== undefined
    ? { usd, sourceUrl: entry.sourceUrl, checkedOn: entry.checkedOn }
    : undefined
}

/** True when any plan of the service has a verified price (decides whether the rate is worth fetching). */
export function hasReferencePrices(serviceId: string): boolean {
  return REFERENCE_PRICES.some((p) => p.serviceId === serviceId)
}
