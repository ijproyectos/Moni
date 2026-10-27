// Simulated aguinaldo plan (amount, pay date and where each part goes). In-memory only.
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

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

const store = createMockStore<AguinaldoPlan>({
  amountCents: 485_000_00,
  payDate: '2026-12-18',
  remind: true,
  confirmed: false,
  destinations: [
    {
      id: 'd1',
      kind: 'goal',
      goalId: 'notebook',
      name: 'Notebook nueva',
      detail: 'Meta',
      cents: 200_000_00,
      color: destinationColor(0),
    },
    {
      id: 'd2',
      kind: 'goal',
      goalId: 'emergencia',
      name: 'Fondo de emergencia',
      detail: 'Meta',
      cents: 85_000_00,
      color: destinationColor(1),
    },
    {
      id: 'd3',
      kind: 'trip',
      name: 'Mendoza',
      detail: 'Viaje · cubre tu parte de $153.000',
      cents: 100_000_00,
      color: destinationColor(2),
    },
    {
      id: 'd4',
      kind: 'card',
      name: 'Tarjeta Visa',
      detail: 'Tarjeta · pagar el cierre del 28',
      cents: 60_000_00,
      color: destinationColor(3),
    },
    {
      id: 'd5',
      kind: 'account',
      name: 'Billetera virtual',
      detail: 'Cuenta · guardado para vos',
      cents: 40_000_00,
      color: destinationColor(4),
    },
  ],
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
