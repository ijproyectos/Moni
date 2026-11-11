import type { CategorySlice } from '@/features/dashboard/domain/monthSummary'
import type { Subscription, SubscriptionCharge } from '@/features/subscriptions/domain/subscription'
import type { Cents } from '@/shared/lib/money'
import type { AntExpenses } from './ants'

// "Lo que Moni detectó": insights built only from sources the app really has.
//   gasto hormiga  <- get_ant_expenses (this month's groups)
//   suscripción    <- the posted charges of a subscription: the last one costs more than the one before
//   gasto inusual  <- a category far above the person's own history
// There is no inflation index in the app, so "Ajustado por inflación" does not exist.

export type InsightKind = 'ant' | 'subscription' | 'unusual'

export type Insight =
  | {
      kind: 'ant'
      /** Stable per month so a dismissal holds until the next month. */
      key: string
      labels: string[]
      yearlyCents: Cents
      weeklyCents: Cents
      count: number
    }
  | {
      kind: 'subscription'
      key: string
      name: string
      percent: number
      fromCents: Cents
      toCents: Cents
      period: Subscription['period']
    }
  | {
      kind: 'unusual'
      key: string
      categoryName: string
      color: string
      currentCents: Cents
      averageCents: Cents
      percent: number
    }

export type AntInsight = Extract<Insight, { kind: 'ant' }>

/** A category is "unusual" at 1.5x its average of the previous months, and at least this much above it. */
export const UNUSUAL_RATIO = 1.5
export const UNUSUAL_MIN_EXTRA_CENTS = 10_000_00
/** At least this many previous months with spending in the category are needed to call it unusual. */
export const UNUSUAL_MIN_HISTORY = 2

export function antInsight(ants: AntExpenses | undefined): AntInsight | null {
  if (!ants || ants.groups.length === 0 || ants.monthTotalCents <= 0) return null
  const yearly = ants.groups.reduce((s, g) => s + g.yearlyProjectionCents, 0)
  return {
    kind: 'ant',
    key: `ant:${ants.month.slice(0, 7)}`,
    labels: ants.groups.slice(0, 2).map((g) => g.label),
    yearlyCents: yearly,
    weeklyCents: Math.round((ants.monthTotalCents * 12) / 52),
    count: ants.groups.reduce((s, g) => s + g.count, 0),
  }
}

/** Subscriptions whose last posted charge is higher than the one before (needs at least two charges). */
export function subscriptionInsights(
  subscriptions: readonly Subscription[],
  charges: readonly SubscriptionCharge[],
): Insight[] {
  const out: Insight[] = []
  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue
    const posted = charges
      .filter((c) => c.subscriptionId === sub.id && c.status === 'posted' && !c.voidedElsewhere)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    const last = posted[posted.length - 1]
    const before = posted[posted.length - 2]
    if (!last || !before || before.amountCents <= 0 || last.amountCents <= before.amountCents) continue
    out.push({
      kind: 'subscription',
      key: `sub:${sub.id}:${last.dueOn}`,
      name: sub.name,
      percent: Math.round(((last.amountCents - before.amountCents) / before.amountCents) * 100),
      fromCents: before.amountCents,
      toCents: last.amountCents,
      period: sub.period,
    })
  }
  return out.sort((a, b) => (b.kind === 'subscription' && a.kind === 'subscription' ? b.percent - a.percent : 0))
}

/**
 * Categories whose spending so far this month is at least 1.5x their average over the previous months and at least
 * $10.000 above it. The average counts only the previous months with spending in the category and needs two of them.
 * Most extra pesos first; at most `limit` results.
 */
export function unusualInsights(
  current: readonly CategorySlice[],
  previousMonths: readonly (readonly CategorySlice[])[],
  monthKey: string,
  limit = 2,
): Insight[] {
  const out: Insight[] = []
  for (const slice of current) {
    if (slice.categoryId.startsWith('template:')) continue
    const history = previousMonths
      .map((m) => m.find((c) => c.categoryId === slice.categoryId)?.amountCents ?? 0)
      .filter((c) => c > 0)
    if (history.length < UNUSUAL_MIN_HISTORY) continue
    const average = Math.round(history.reduce((s, c) => s + c, 0) / history.length)
    const extra = slice.amountCents - average
    if (slice.amountCents < average * UNUSUAL_RATIO || extra < UNUSUAL_MIN_EXTRA_CENTS) continue
    out.push({
      kind: 'unusual',
      key: `unusual:${monthKey.slice(0, 7)}:${slice.categoryId}`,
      categoryName: slice.name,
      color: slice.color,
      currentCents: slice.amountCents,
      averageCents: average,
      percent: Math.round((extra / average) * 100),
    })
  }
  return out
    .sort((a, b) =>
      a.kind === 'unusual' && b.kind === 'unusual'
        ? b.currentCents - b.averageCents - (a.currentCents - a.averageCents)
        : 0,
    )
    .slice(0, limit)
}

export function visibleInsights(all: readonly Insight[], dismissed: ReadonlySet<string>): Insight[] {
  return all.filter((i) => !dismissed.has(i.key))
}

// --- Dismissals: kept on the device (no table), by insight key. ---

export const DISMISSED_STORAGE_KEY = 'moni.insights.dismissed.v1'
const MAX_KEPT = 200

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadDismissed(storage: StorageLike | null = defaultStorage()): Set<string> {
  try {
    const raw = storage?.getItem(DISMISSED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissInsight(key: string, storage: StorageLike | null = defaultStorage()): Set<string> {
  const next = loadDismissed(storage)
  next.add(key)
  try {
    storage?.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...next].slice(-MAX_KEPT)))
  } catch {
    // Storage unavailable (private mode): the dismissal lasts until the page is closed.
  }
  return next
}
