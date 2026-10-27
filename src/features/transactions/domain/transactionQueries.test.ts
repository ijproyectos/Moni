import type { Category } from '@/features/categories/domain/category'
import { calendarDayTotals, filterTransactions, groupByDay, totalsOf } from './transactionQueries'
import { makeTransaction } from './testing'

const comida: Category = {
  id: 'cat-comida',
  kind: 'expense',
  name: 'Comida',
  icon: 'Utensils',
  color: '#E5533D',
  archivedAt: null,
}
const sueldo: Category = { ...comida, id: 'cat-sueldo', kind: 'income', name: 'Sueldo' }
const categories = new Map([comida, sueldo].map((c) => [c.id, c]))

const list = [
  makeTransaction({
    id: '1',
    categoryId: comida.id,
    amountCents: 1000,
    occurredOn: '2026-10-10',
    note: 'Café con medialunas',
  }),
  makeTransaction({ id: '2', categoryId: comida.id, amountCents: 2500, occurredOn: '2026-10-10' }),
  makeTransaction({
    id: '3',
    kind: 'income',
    categoryId: sueldo.id,
    amountCents: 50000,
    occurredOn: '2026-10-01',
  }),
  makeTransaction({ id: '4', status: 'voided', amountCents: 999, occurredOn: '2026-10-10' }),
  makeTransaction({
    id: '5',
    kind: 'shared_payment',
    categoryId: null,
    amountCents: 777,
    occurredOn: '2026-10-11',
  }),
  makeTransaction({ id: '6', categoryId: comida.id, amountCents: 100, occurredOn: '2026-09-30' }),
]

describe('filterTransactions', () => {
  it('searches note and category name ignoring case and accents', () => {
    expect(filterTransactions(list, { search: 'CAFE' }, categories).map((t) => t.id)).toEqual(['1'])
    expect(filterTransactions(list, { search: 'sueld' }, categories).map((t) => t.id)).toEqual([
      '3',
    ])
  })

  it('filters by kind, category and inclusive date range', () => {
    expect(filterTransactions(list, { kind: 'income' }).map((t) => t.id)).toEqual(['3'])
    expect(filterTransactions(list, { categoryIds: [sueldo.id] }).map((t) => t.id)).toEqual(['3'])
    const october = filterTransactions(list, { from: '2026-10-01', to: '2026-10-10' })
    expect(october.map((t) => t.id)).toEqual(['1', '2', '3', '4'])
  })

  it('combines filters with AND', () => {
    expect(
      filterTransactions(
        list,
        { kind: 'expense', search: 'comida', from: '2026-10-01' },
        categories,
      ).map((t) => t.id),
    ).toEqual(['1', '2'])
  })
})

describe('groupByDay', () => {
  it('orders days newest first and nets only statistics kinds', () => {
    const groups = groupByDay(list)
    expect(groups.map((g) => g.date)).toEqual([
      '2026-10-11',
      '2026-10-10',
      '2026-10-01',
      '2026-09-30',
    ])
    const tenth = groups.find((g) => g.date === '2026-10-10')
    expect(tenth?.netCents).toBe(-3500)
    expect(tenth?.items).toHaveLength(3)
    expect(groups[0]?.netCents).toBe(0)
  })
})

describe('calendarDayTotals', () => {
  it('returns every day of the month with per-day totals', () => {
    const days = calendarDayTotals(list, '2026-10-15')
    expect(days).toHaveLength(31)
    expect(days[9]).toEqual({ date: '2026-10-10', expenseCents: 3500, incomeCents: 0 })
    expect(days[0]).toEqual({ date: '2026-10-01', expenseCents: 0, incomeCents: 50000 })
    expect(days[10]?.expenseCents).toBe(0)
  })
})

describe('totalsOf', () => {
  it('excludes voided and reserved kinds', () => {
    expect(totalsOf(list)).toEqual({ incomeCents: 50000, expenseCents: 3600 })
  })
})
