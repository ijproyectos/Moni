// Simulated data for Metas. Lives in memory only; nothing is written to Supabase.
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import type { Contribution, Goal, SharedGoalInfo } from '../domain/goals'

/** No estimate until the person types one (nothing here is real data). */
export const MOCK_AGUINALDO_ESTIMATE: Cents = 0
/** Shared goals have no backend yet (see FEATURES.sharedGoals): no partner, spaces or sources. */
export const MOCK_PARTNER = ''
export const MOCK_SPACES: readonly { name: string; kind: 'couple' | 'home' }[] = []
export const MOCK_SOURCES: readonly string[] = []

/** Personal goals are real now (Supabase). Only the shared goals, still simulated, live in this memory. */
const INITIAL: Goal[] = []

const store = createMockStore<Goal[]>(INITIAL)

export function useGoals(): Goal[] {
  return useMockStore(store)
}

export function useGoal(id: string | undefined): Goal | undefined {
  return useGoals().find((g) => g.id === id)
}

export function addGoal(goal: Omit<Goal, 'id' | 'contributions' | 'savedCents'>): Goal {
  const created: Goal = { ...goal, id: mockId('goal'), savedCents: 0, contributions: [] }
  store.set((goals) => [...goals, created])
  return created
}

export function contribute(
  goalId: string,
  cents: Cents,
  source: string,
  label: string,
  date: string,
) {
  const contribution: Contribution = { id: mockId('c'), label, date, source, cents }
  store.set((goals) =>
    goals.map((g) =>
      g.id !== goalId
        ? g
        : {
            ...g,
            savedCents: g.savedCents + cents,
            contributions: [contribution, ...g.contributions],
            shared: g.shared && {
              ...g.shared,
              mineCents: g.shared.mineCents + cents,
              monthMineCents: g.shared.monthMineCents + cents,
            },
          },
    ),
  )
}

export function updateShared(goalId: string, patch: Partial<SharedGoalInfo>) {
  store.set((goals) =>
    goals.map((g) =>
      g.id === goalId && g.shared ? { ...g, shared: { ...g.shared, ...patch } } : g,
    ),
  )
}

export function newInviteCode(name: string): string {
  const word =
    (name.split(/\s+/)[0] ?? 'META')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 5) || 'META'
  return `${word}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}
