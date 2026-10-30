/**
 * Feature flags for screens that have NO real backend yet.
 * Every flag defaults to `false`: the entry points are hidden and the routes redirect home.
 * See docs/FEATURE_FLAGS.md for what each flag needs before it can be turned on.
 */
export interface FeatureFlags {
  /** Avisos inbox + the bell badge on Home. */
  notifications: boolean
  /** Debts screen ("Deudas") and reminders. */
  debts: boolean
  /** Aguinaldo planner. */
  aguinaldo: boolean
  /** "Solo yo" trips (group trips are real groups). */
  soloTrips: boolean
  /** Pro paywall, integrations and trial. */
  pro: boolean
  /** Referral program ("Recomendá Moni"). */
  referral: boolean
  /** Goals shared with a partner or group. */
  sharedGoals: boolean
  /** Weekly digest settings. */
  weeklyDigest: boolean
  /** Payment alias shown to get paid. */
  accountAlias: boolean
  /** Monthly income on the profile. */
  monthlyIncome: boolean
  /** People without Moni, split by amount and simulated settlements inside groups. */
  groupGuestsAndSimulatedSplits: boolean
}

export const FEATURES: FeatureFlags = {
  notifications: false,
  debts: false,
  aguinaldo: false,
  soloTrips: false,
  pro: false,
  referral: false,
  sharedGoals: false,
  weeklyDigest: false,
  accountAlias: false,
  monthlyIncome: false,
  groupGuestsAndSimulatedSplits: false,
}

export type FeatureFlag = keyof FeatureFlags
