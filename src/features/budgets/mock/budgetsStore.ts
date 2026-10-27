// Simulated monthly limits per category (Presupuestos). In-memory only.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'

const store = createMockStore<Record<string, Cents>>({})

export function useBudgets(): Record<string, Cents> {
  return useMockStore(store)
}

export function setBudget(categoryId: string, cents: Cents | null) {
  store.set((all) => {
    const rest = Object.fromEntries(Object.entries(all).filter(([id]) => id !== categoryId))
    return cents && cents > 0 ? { ...rest, [categoryId]: cents } : rest
  })
}
