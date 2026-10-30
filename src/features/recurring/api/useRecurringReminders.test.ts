import { renderHook } from '@testing-library/react'
import { useRecurringReminders } from './useRecurringReminders'

const fixed = vi.hoisted(() => ({ current: [] as { key: string; text: string }[] }))
const subs = vi.hoisted(() => ({ current: [] as { subscriptionId: string; text: string }[] }))
vi.mock('@/features/fixedExpenses/api/useFixedExpenses', () => ({
  useFixedExpenseReminders: () => fixed.current,
}))
vi.mock('@/features/subscriptions/api/useSubscriptions', () => ({
  useSubscriptionReminders: () => subs.current,
}))

describe('useRecurringReminders', () => {
  it('merges both kinds, fixed expenses first, each with its own destination', () => {
    fixed.current = [{ key: 'occ-1', text: 'Hoy vence tu factura de luz. ¿Cuánto pagaste?' }]
    subs.current = [{ subscriptionId: 's1', text: 'Mañana se cobra Netflix: $18.000 de Galicia' }]
    const { result } = renderHook(() => useRecurringReminders())
    expect(result.current.map((r) => [r.key, r.to])).toEqual([
      ['fixed-occ-1', '/recurrentes?tab=gastos-fijos'],
      ['sub-s1', '/recurrentes'],
    ])
  })

  it('is empty when there is nothing', () => {
    fixed.current = []
    subs.current = []
    const { result } = renderHook(() => useRecurringReminders())
    expect(result.current).toEqual([])
  })
})
