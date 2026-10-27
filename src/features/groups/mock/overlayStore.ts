// In-memory overlay for group features the database does not support yet (decided 2026-10-27):
// people without Moni, several payers, split by amount, renaming/deleting groups, couple split by
// income, recurring house expenses, trip info and settlements recorded on someone else's behalf.
// Nothing here is written to Supabase and it is lost on reload.
import { createMockStore, mockId, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

export interface Guest {
  id: string
  name: string
  alias: string
}

export interface SimAmount {
  personId: string
  cents: Cents
}

export interface SimExpense {
  id: string
  description: string
  amountCents: Cents
  payers: SimAmount[]
  shares: SimAmount[]
  occurredOn: IsoDate
  templateSlug: string | null
  methodLabel: string
  createdAt: string
}

export interface SimSettlement {
  id: string
  fromId: string
  toId: string
  cents: Cents
  method: string
  occurredOn: IsoDate
}

export interface Recurring {
  id: string
  name: string
  day: number
  icon: 'house' | 'plug' | 'refresh'
  enabled: boolean
}

export interface TripInfo {
  from: IsoDate
  to: IsoDate
  budgetCents: Cents
}

export interface GroupOverlay {
  name?: string
  deleted?: boolean
  guests: Guest[]
  expenses: SimExpense[]
  settlements: SimSettlement[]
  /** Couples: how expenses are split by default. */
  coupleSplit: 'half' | 'income'
  /** My share when splitting by income (0..1). */
  incomeShare: number
  recurring: Recurring[]
  trip?: TripInfo
  /** Alias shown in summaries to get paid. */
  collectAlias?: string
}

export const DEFAULT_RECURRING: Recurring[] = [
  { id: 'rent', name: 'Alquiler', day: 5, icon: 'house', enabled: true },
  { id: 'power', name: 'Luz y gas', day: 12, icon: 'plug', enabled: true },
  { id: 'internet', name: 'Internet', day: 20, icon: 'refresh', enabled: true },
]

export function emptyOverlay(): GroupOverlay {
  return {
    guests: [],
    expenses: [],
    settlements: [],
    coupleSplit: 'half',
    incomeShare: 0.6,
    recurring: [],
  }
}

const store = createMockStore<Record<string, GroupOverlay>>({})

export function useOverlays(): Record<string, GroupOverlay> {
  return useMockStore(store)
}

export function useOverlay(groupId: string | undefined): GroupOverlay {
  const all = useOverlays()
  return (groupId && all[groupId]) || EMPTY
}

const EMPTY = emptyOverlay()

export function patchOverlay(
  groupId: string,
  patch: Partial<GroupOverlay> | ((o: GroupOverlay) => Partial<GroupOverlay>),
) {
  store.set((all) => {
    const current = all[groupId] ?? emptyOverlay()
    const next = typeof patch === 'function' ? patch(current) : patch
    return { ...all, [groupId]: { ...current, ...next } }
  })
}

export function addGuest(groupId: string, name: string, alias: string): Guest {
  const guest = { id: mockId('guest'), name: name.trim(), alias: alias.trim() }
  patchOverlay(groupId, (o) => ({ guests: [...o.guests, guest] }))
  return guest
}

export function updateGuest(groupId: string, guestId: string, patch: Partial<Guest>) {
  patchOverlay(groupId, (o) => ({
    guests: o.guests.map((g) => (g.id === guestId ? { ...g, ...patch } : g)),
  }))
}

/** Removing someone drops them from simulated expenses; their part is re-split among the rest. */
export function removeGuest(groupId: string, guestId: string) {
  patchOverlay(groupId, (o) => ({
    guests: o.guests.filter((g) => g.id !== guestId),
    expenses: o.expenses.map((e) => resplitWithout(e, guestId)),
    settlements: o.settlements.filter((s) => s.fromId !== guestId && s.toId !== guestId),
  }))
}

function resplitWithout(expense: SimExpense, personId: string): SimExpense {
  const payers = expense.payers.filter((p) => p.personId !== personId)
  const rest = expense.shares.filter((s) => s.personId !== personId)
  if (rest.length === 0 || payers.length === 0) return { ...expense, payers, shares: rest }
  const paidTotal = payers.reduce((s, p) => s + p.cents, 0)
  const base = Math.floor(paidTotal / rest.length)
  const leftover = paidTotal - base * rest.length
  return {
    ...expense,
    amountCents: paidTotal,
    payers,
    shares: rest.map((s, i) => ({ personId: s.personId, cents: base + (i < leftover ? 1 : 0) })),
  }
}

export function addSimExpense(
  groupId: string,
  expense: Omit<SimExpense, 'id' | 'createdAt'>,
): SimExpense {
  const created = { ...expense, id: mockId('sim'), createdAt: new Date().toISOString() }
  patchOverlay(groupId, (o) => ({ expenses: [created, ...o.expenses] }))
  return created
}

export function removeSimExpense(groupId: string, expenseId: string): SimExpense | undefined {
  let removed: SimExpense | undefined
  patchOverlay(groupId, (o) => {
    removed = o.expenses.find((e) => e.id === expenseId)
    return { expenses: o.expenses.filter((e) => e.id !== expenseId) }
  })
  return removed
}

export function restoreSimExpense(groupId: string, expense: SimExpense) {
  patchOverlay(groupId, (o) => ({ expenses: [expense, ...o.expenses] }))
}

export function addSimSettlement(groupId: string, s: Omit<SimSettlement, 'id'>) {
  patchOverlay(groupId, (o) => ({
    settlements: [...o.settlements, { ...s, id: mockId('settle') }],
  }))
}

export function isSimId(id: string): boolean {
  return id.startsWith('sim-') || id.startsWith('guest-')
}
