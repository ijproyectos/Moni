// Simulated aguinaldo plan (amount, pay date and where each part goes). In-memory only.
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'

export type DestinationKind = 'goal' | 'trip' | 'card' | 'account' | 'installments'

export interface Destination {
  id: string
  kind: DestinationKind
  name: string
  detail: string
  cents: Cents
  color: string
  goalId?: string
}

export interface AguinaldoPlan {
  amountCents: Cents
  payDate: IsoDate
  remind: boolean
  destinations: Destination[]
  confirmed: boolean
}

export const DESTINATION_COLORS = [
  '#064735',
  '#2f9e8f',
  '#f0aa2a',
  '#8a6bd1',
  '#6dbe3a',
  '#e5533d',
  '#1f9fc4',
] as const

export function destinationColor(index: number): string {
  return DESTINATION_COLORS[index % DESTINATION_COLORS.length] ?? '#064735'
}

// Empty on purpose: the person enters the amount and the split themselves.
const store = createMockStore<AguinaldoPlan>({
  amountCents: 0,
  payDate: todayIso(),
  remind: false,
  confirmed: false,
  destinations: [],
})

export function useAguinaldo(): AguinaldoPlan {
  return useMockStore(store)
}

export function updateAguinaldo(patch: Partial<AguinaldoPlan>) {
  store.set((p) => ({ ...p, ...patch }))
}

export function setDestinationAmount(id: string, cents: Cents) {
  store.set((p) => ({
    ...p,
    destinations: p.destinations.map((d) => (d.id === id ? { ...d, cents } : d)),
  }))
}

export function addDestination(d: Omit<Destination, 'id' | 'color'>) {
  store.set((p) => ({
    ...p,
    destinations: [
      ...p.destinations,
      { ...d, id: mockId('dest'), color: destinationColor(p.destinations.length) },
    ],
  }))
}
