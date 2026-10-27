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
  { id: ALL_GOALS_ID, label: 'Todo lo anterior' },
]

const SPECIFIC_IDS = GOAL_OPTIONS.filter((g) => g.id !== ALL_GOALS_ID).map((g) => g.id)

/** "Todo lo anterior" selects or clears every goal; picking all four others also checks it. */
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
