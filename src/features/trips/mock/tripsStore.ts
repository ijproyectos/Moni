// Simulated solo trips (Viajes "Solo yo"). Group trips are real groups of kind "viaje".
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

export interface BudgetItem {
  name: string
  icon: 'house' | 'food' | 'bus' | 'pin'
  share: number
}

export interface SoloTrip {
  id: string
  name: string
  from: IsoDate
  to: IsoDate
  budgetCents: Cents
  savedCents: Cents
  saving: boolean
  items: BudgetItem[]
  spentCents: Cents
}

export interface PastTrip {
  id: string
  name: string
  label: string
  myShareCents: Cents
}

export const DEFAULT_BUDGET_ITEMS: BudgetItem[] = [
  { name: 'Alojamiento', icon: 'house', share: 0.4 },
  { name: 'Comida', icon: 'food', share: 0.25 },
  { name: 'Transporte', icon: 'bus', share: 0.2 },
  { name: 'Excursiones', icon: 'pin', share: 0.15 },
]

const store = createMockStore<{ solo: SoloTrip[]; past: PastTrip[] }>({ solo: [], past: [] })

export function useTrips() {
  return useMockStore(store)
}

export function useSoloTrip(id: string | undefined): SoloTrip | undefined {
  return useTrips().solo.find((t) => t.id === id)
}

export function addSoloTrip(
  trip: Omit<SoloTrip, 'id' | 'items' | 'spentCents' | 'savedCents'>,
): SoloTrip {
  const created = {
    ...trip,
    id: mockId('trip'),
    items: DEFAULT_BUDGET_ITEMS,
    spentCents: 0,
    savedCents: 0,
  }
  store.set((s) => ({ ...s, solo: [...s.solo, created] }))
  return created
}

export function addTripSpending(id: string, cents: Cents) {
  store.set((s) => ({
    ...s,
    solo: s.solo.map((t) => (t.id === id ? { ...t, spentCents: t.spentCents + cents } : t)),
  }))
}
