import { makeTransaction } from '@/features/transactions/domain/testing'
import type { Category } from '@/features/categories/domain/category'
import { buildRecentMovements, groupMovementsByMonth } from './recentMovements'

const FOOD: Category = {
  id: 'cat-food',
  kind: 'expense',
  name: 'Comida',
  icon: 'Utensils',
  color: '#E5533D',
  archivedAt: null,
}
const categoriesById = new Map([[FOOD.id, FOOD]])
const accountNamesById = new Map([['acc-1', 'Efectivo']])

function build(
  transactions: Parameters<typeof buildRecentMovements>[0]['transactions'],
  limit = 20,
) {
  return buildRecentMovements({
    transactions,
    categoriesById,
    accountNamesById,
    today: '2026-11-01',
    limit,
  })
}

describe('buildRecentMovements', () => {
  it('lists the newest movements across months with their category and account', () => {
    const result = build([
      makeTransaction({
        id: 'old',
        occurredOn: '2026-10-05',
        accountId: 'acc-1',
        categoryId: FOOD.id,
      }),
      makeTransaction({
        id: 'new',
        occurredOn: '2026-11-01',
        accountId: 'acc-1',
        categoryId: null,
      }),
    ])
    expect(result.map((m) => m.id)).toEqual(['new', 'old'])
    expect(result[1]).toMatchObject({ categoryName: 'Comida', accountName: 'Efectivo' })
    expect(result[0]).toMatchObject({ categoryName: null })
  })

  it('breaks same-day ties by creation time and honours the limit', () => {
    const result = build(
      [
        makeTransaction({ id: 'a', occurredOn: '2026-10-05', createdAt: '2026-10-05T08:00:00Z' }),
        makeTransaction({ id: 'b', occurredOn: '2026-10-05', createdAt: '2026-10-05T09:00:00Z' }),
        makeTransaction({ id: 'c', occurredOn: '2026-10-04' }),
      ],
      2,
    )
    expect(result.map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('leaves out scheduled installments and voided movements', () => {
    const result = build([
      makeTransaction({ id: 'future', occurredOn: '2026-12-01', installmentPlanId: 'plan' }),
      makeTransaction({ id: 'voided', status: 'voided' }),
      makeTransaction({ id: 'ok' }),
    ])
    expect(result.map((m) => m.id)).toEqual(['ok'])
  })
})

describe('groupMovementsByMonth', () => {
  it('starts a new group each time the month changes, keeping the order', () => {
    const movements = build([
      makeTransaction({ id: 'n1', occurredOn: '2026-11-01' }),
      makeTransaction({ id: 'o1', occurredOn: '2026-10-31' }),
      makeTransaction({ id: 'o2', occurredOn: '2026-10-02' }),
    ])
    const groups = groupMovementsByMonth(movements)
    expect(groups.map((g) => g.month)).toEqual(['2026-11-01', '2026-10-01'])
    expect(groups[1]?.movements.map((m) => m.id)).toEqual(['o1', 'o2'])
  })

  it('returns no groups for no movements', () => {
    expect(groupMovementsByMonth([])).toEqual([])
  })
})
