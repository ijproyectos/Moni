// Simulated subscriptions and installment purchases (Fijos y cuotas). In-memory only.
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

export interface Subscription {
  id: string
  name: string
  kind: string
  monthlyCents: Cents
  billingDay: number
  method: string
  period: 'monthly' | 'yearly'
  remind: boolean
  color: string
  tint: string
}

export interface InstallmentPurchase {
  id: string
  name: string
  method: string
  installmentCents: Cents
  total: number
  paid: number
  endDate: IsoDate
  tint: string
  color: string
}

interface RecurringState {
  subscriptions: Subscription[]
  installments: InstallmentPurchase[]
  /** A charge Moni "found" in the movements and suggests adding. */
  suggestion: { name: string; monthlyCents: Cents; billingDay: number } | null
}

const sub = (
  name: string,
  kind: string,
  monthly: number,
  billingDay: number,
  method: string,
  color: string,
  tint: string,
): Subscription => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  kind,
  monthlyCents: monthly * 100,
  billingDay,
  method,
  period: 'monthly',
  remind: true,
  color,
  tint,
})

const store = createMockStore<RecurringState>({
  subscriptions: [
    sub('Netflix', 'Streaming', 8_000, 18, 'Visa', '#b8321f', '#fbdcd7'),
    sub('Spotify', 'Música', 6_500, 9, 'Visa', '#2f7d1f', '#e3f2cf'),
    sub('Amazon Prime', 'Compras y video', 9_900, 22, 'Visa', '#2f7d6f', '#d9ebe4'),
    sub('YouTube Premium', 'Video', 7_800, 14, 'Cuenta sueldo', '#b8321f', '#fbdcd7'),
    sub('iCloud', 'Almacenamiento', 2_900, 3, 'Visa', '#6b4fb8', '#e7defa'),
    sub('Gimnasio', 'Deporte', 15_000, 5, 'Cuenta sueldo', '#8a5a00', '#fdeab8'),
  ],
  installments: [
    {
      id: 'celu',
      name: 'Celular',
      method: 'Visa',
      installmentCents: 30_000_00,
      total: 12,
      paid: 6,
      endDate: '2027-04-10',
      tint: '#d9ebe4',
      color: '#2f7d6f',
    },
    {
      id: 'zapas',
      name: 'Zapatillas',
      method: 'Visa',
      installmentCents: 12_000_00,
      total: 3,
      paid: 2,
      endDate: '2026-11-10',
      tint: '#fdeab8',
      color: '#8a5a00',
    },
  ],
  suggestion: { name: 'Disney+', monthlyCents: 6_900_00, billingDay: 11 },
})

export function useRecurring(): RecurringState {
  return useMockStore(store)
}

export function addSubscription(s: Omit<Subscription, 'id' | 'color' | 'tint'>) {
  const palette = [
    ['#b8321f', '#fbdcd7'],
    ['#2f7d1f', '#e3f2cf'],
    ['#2f7d6f', '#d9ebe4'],
    ['#6b4fb8', '#e7defa'],
    ['#8a5a00', '#fdeab8'],
  ] as const
  store.set((st) => {
    const [color, tint] = palette[st.subscriptions.length % palette.length] ?? palette[0]
    return {
      ...st,
      subscriptions: [...st.subscriptions, { ...s, id: mockId('sub'), color, tint }],
      suggestion: st.suggestion?.name === s.name ? null : st.suggestion,
    }
  })
}

export function addInstallmentPurchase(p: Omit<InstallmentPurchase, 'id' | 'color' | 'tint'>) {
  store.set((st) => ({
    ...st,
    installments: [
      ...st.installments,
      { ...p, id: mockId('cuota'), tint: '#e3f2cf', color: '#2f7d1f' },
    ],
  }))
}

export function dismissSuggestion() {
  store.set((st) => ({ ...st, suggestion: null }))
}
