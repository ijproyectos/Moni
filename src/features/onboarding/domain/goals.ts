export const ALL_GOALS_ID = 'all'

export interface GoalOption {
  id: string
  label: string
}

export const GOAL_OPTIONS: readonly GoalOption[] = [
  { id: 'track_spending', label: 'Saber en qué se me va la plata' },
  { id: 'save_monthly', label: 'Ahorrar todos los meses' },
  { id: 'split_expenses', label: 'Dividir gastos con mi pareja o amigos' },
  { id: 'control_recurring', label: 'Controlar suscripciones, gastos fijos y cuotas' },
  { id: 'plan_trips', label: 'Planear mis viajes' },
  { id: ALL_GOALS_ID, label: 'Todo lo anterior' },
]

const SPECIFIC_IDS = GOAL_OPTIONS.filter((g) => g.id !== ALL_GOALS_ID).map((g) => g.id)

/** "Todo lo anterior" selects or clears every goal; picking all the others also checks it. */
export function toggleGoal(selected: readonly string[], id: string): string[] {
  if (id === ALL_GOALS_ID) {
    return selected.includes(ALL_GOALS_ID) ? [] : [...SPECIFIC_IDS, ALL_GOALS_ID]
  }
  const without = selected.filter((g) => g !== id && g !== ALL_GOALS_ID)
  const next = selected.includes(id) ? without : [...without, id]
  return SPECIFIC_IDS.every((g) => next.includes(g)) ? [...next, ALL_GOALS_ID] : next
}

/** Goals persisted in the profile: the aggregate option is derived, so it is not stored. */
export function goalsToPersist(selected: readonly string[]): string[] {
  return selected.filter((g) => g !== ALL_GOALS_ID)
}

/** Sections of the app that can be personalized. Core screens (Inicio, Actividad, cuentas, categorías) are always shown. */
export type AppFeature =
  'reports' | 'ants' | 'savings' | 'aguinaldo' | 'recurring' | 'groups' | 'debts' | 'trips'

export const ALL_FEATURES: readonly AppFeature[] = [
  'reports',
  'ants',
  'savings',
  'aguinaldo',
  'recurring',
  'groups',
  'debts',
  'trips',
]

/** What each goal turns on. "Presupuestos y metas" serves both saving and fixed-cost control. */
export const GOAL_FEATURES: Record<string, readonly AppFeature[]> = {
  track_spending: ['reports', 'ants'],
  save_monthly: ['savings', 'aguinaldo'],
  split_expenses: ['groups', 'debts'],
  control_recurring: ['recurring', 'savings'],
  plan_trips: ['trips'],
}

/** Known goal ids that can be stored (the aggregate "all" option is derived). */
export function sanitizeGoals(goals: readonly string[] | null | undefined): string[] {
  return SPECIFIC_IDS.filter((id) => goals?.includes(id))
}

/**
 * Sections to feature for the saved goals. Without goals (onboarding skipped) nothing is hidden,
 * since there is nothing to personalize from.
 */
export function featuresForGoals(goals: readonly string[] | null | undefined): Set<AppFeature> {
  const known = sanitizeGoals(goals)
  if (known.length === 0) return new Set(ALL_FEATURES)
  return new Set(known.flatMap((g) => GOAL_FEATURES[g] ?? []))
}

/** Goals as shown in a selector: adds the derived "all" option when every goal is saved. */
export function goalsForSelector(goals: readonly string[] | null | undefined): string[] {
  const known = sanitizeGoals(goals)
  return known.length === SPECIFIC_IDS.length ? [...known, ALL_GOALS_ID] : known
}
