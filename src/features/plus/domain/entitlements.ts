import type { PlusGateReason } from './plus'

/**
 * What Free and Moni Plus can do, in ONE place. The database is the source of truth for the plan (plus_entitlements) and enforces
 * every limit again on the server; this file only decides what the screens offer, label and open, so no screen repeats the rules.
 *
 * Free: manual loading without limits, balances and movements, the basic notice center, ONE group of their own in total (they can join any
 * group they are invited to and use it fully), manual payment methods, ONE savings goal in total, ONE trip in total, Ahorros, Categorías,
 * exporting to Excel and every essential setting. Everything else below is Moni Plus.
 */
export const FREE_LIMITS = { groups: 1, goals: 1, trips: 1 } as const
export type LimitedKind = keyof typeof FREE_LIMITS

/** Every capability that has its own Moni Plus promo. */
export type PlusFeature =
  | 'photo'
  | 'voice'
  | 'assistant'
  | 'groups'
  | 'reminders'
  | 'mercadopago'
  | 'goals'
  | 'health'
  | 'trips'
  | 'recurring'
  | 'ants'
  | 'reports'
  | 'smart_notices'
  | 'excel_import'

/** Plus only, from the first use. (Groups, goals and trips have a free modality: they only hit the promo past the free limit.) */
export const PLUS_ONLY_FEATURES: readonly PlusFeature[] = [
  'photo',
  'voice',
  'assistant',
  'reminders',
  'mercadopago',
  'health',
  'recurring',
  'ants',
  'reports',
  'smart_notices',
  'excel_import',
]

export const isPlusOnly = (feature: PlusFeature): boolean => PLUS_ONLY_FEATURES.includes(feature)

/**
 * The limits are TOTALS per person (everything ever created counts, whatever its type, category, currency or state; archiving, hiding,
 * pausing or finishing never frees one). Free may create a new one only while it has created fewer than the free limit. What already exists is never touched: after
 * cancelling Plus the person keeps seeing and managing everything, they just cannot create beyond the limit.
 */
export function canCreateMore(kind: LimitedKind, createdCount: number, isFree: boolean): boolean {
  return !isFree || createdCount < FREE_LIMITS[kind]
}

/** The copy of the full Plus screen for each promo (the old reasons keep their text). */
export function reasonOf(feature: PlusFeature): PlusGateReason {
  switch (feature) {
    case 'photo':
      return 'receipt'
    case 'voice':
      return 'voice'
    case 'assistant':
      return 'assistant'
    case 'groups':
      return 'group'
    case 'mercadopago':
      return 'mp_import'
    default:
      return 'generic'
  }
}
