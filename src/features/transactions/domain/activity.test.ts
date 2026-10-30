import type { Category } from '@/features/categories/domain/category'
import { buildActivity, countEntries, groupByCategory, type ActivityFilters } from './activity'
import { makeTransaction } from './testing'
import type { Transfer } from './transaction'

const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'
const categories = new Map<string, Category>([
  [
    FOOD,
    {
      id: FOOD,
      kind: 'expense',
      name: 'Comida',
      icon: 'Utensils',
      color: '#E5533D',
      archivedAt: null,
    },
  ],
  [
    SALARY,
    {
      id: SALARY,
      kind: 'income',
      name: 'Sueldo',
      icon: 'Wallet',
      color: '#0E8A6D',
      archivedAt: null,
    },
  ],
])
const transfer: Transfer = {
  id: 'tr1',
  fromAccountId: 'a',
  toAccountId: 'b',
  amountCents: 5000,
  occurredOn: '2026-10-10',
  note: null,
  status: 'posted',
  voidedAt: null,
  createdAt: '2026-10-10T10:00:00Z',
}
const transactions = [
  makeTransaction({ id: 'e1', note: 'Cena', amountCents: 2200000, occurredOn: '2026-10-25' }),
  makeTransaction({
    id: 'i1',
    kind: 'income',
    categoryId: SALARY,
    amountCents: 97000000,
    occurredOn: '2026-10-10',
  }),
]
const base: ActivityFilters = { search: '', kind: 'all', categoryId: null, day: null }
const run = (filters: Partial<ActivityFilters>) =>
  buildActivity({
    transactions,
    transfers: [transfer],
    filters: { ...base, ...filters },
    categoriesById: categories,
    accountNamesById: new Map([
      ['a', 'Efectivo'],
      ['b', 'Banco'],
    ]),
  })

describe('buildActivity', () => {
  it('groups newest day first and keeps transfers out of the day net', () => {
    const days = run({})
    expect(days.map((d) => d.date)).toEqual(['2026-10-25', '2026-10-10'])
    expect(countEntries(days)).toBe(3)
    expect(days[1]?.netCents).toBe(97000000)
  })

  it('hides transfers when filtering by kind or category', () => {
    expect(countEntries(run({ kind: 'expense' }))).toBe(1)
    expect(countEntries(run({ categoryId: FOOD }))).toBe(1)
  })

  it('searches by note and category name, accent-insensitive', () => {
    expect(countEntries(run({ search: 'cena' }))).toBe(1)
    expect(countEntries(run({ search: 'SUELDO' }))).toBe(1)
    expect(countEntries(run({ search: 'transferencia' }))).toBe(1)
  })

  it('filters by selected day', () => {
    expect(countEntries(run({ day: '2026-10-25' }))).toBe(1)
  })
})

describe('groupByCategory', () => {
  const OTHER = '44444444-4444-4444-8444-444444444444'
  const withOther = new Map(categories).set(OTHER, {
    id: OTHER,
    kind: 'expense',
    name: 'Súper',
    icon: 'ShoppingCart',
    color: '#064735',
    archivedAt: null,
  })
  const mixed = [
    makeTransaction({ id: 'f1', categoryId: FOOD, amountCents: 1000, occurredOn: '2026-10-20' }),
    makeTransaction({ id: 'f2', categoryId: FOOD, amountCents: 2000, occurredOn: '2026-10-05' }),
    makeTransaction({ id: 's1', categoryId: OTHER, amountCents: 9000, occurredOn: '2026-10-06' }),
    makeTransaction({
      id: 'i1',
      kind: 'income',
      categoryId: SALARY,
      amountCents: 50000,
      occurredOn: '2026-10-01',
    }),
    makeTransaction({ id: 'n1', categoryId: null, amountCents: 400, occurredOn: '2026-10-02' }),
    makeTransaction({
      id: 'o1',
      kind: 'opening_in',
      categoryId: null,
      amountCents: 70000,
      occurredOn: '2026-10-01',
    }),
    makeTransaction({
      id: 'a1',
      kind: 'adjustment_out',
      categoryId: null,
      amountCents: 300,
      occurredOn: '2026-10-03',
    }),
  ]
  const groups = (filters: Partial<ActivityFilters> = {}) =>
    groupByCategory(
      buildActivity({
        transactions: mixed,
        transfers: [transfer],
        filters: { ...base, ...filters },
        categoriesById: withOther,
        accountNamesById: new Map(),
      }),
      withOther,
    )

  it('groups by category and routes category-less kinds to dedicated buckets', () => {
    const result = groups()
    expect(result.map((g) => [g.label, g.count])).toEqual([
      ['Saldo inicial', 1],
      ['Sueldo', 1],
      ['Súper', 1],
      ['Transferencias', 1],
      ['Comida', 2],
      ['Sin categoría', 1],
      ['Ajustes de saldo', 1],
    ])
  })

  it('sorts by total descending and reports magnitude with direction', () => {
    const result = groups()
    const totals = result.map((g) => g.totalCents)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    const food = result.find((g) => g.label === 'Comida')
    expect(food).toMatchObject({ totalCents: 3000, direction: 'out', type: 'category' })
    expect(result.find((g) => g.label === 'Sueldo')?.direction).toBe('in')
    expect(result.find((g) => g.label === 'Transferencias')?.direction).toBe('neutral')
    expect(result.find((g) => g.label === 'Ajustes de saldo')?.direction).toBe('out')
  })

  it('keeps entries newest first inside a group', () => {
    const food = groups().find((g) => g.label === 'Comida')
    expect(food?.entries.map((e) => e.id)).toEqual(['f1', 'f2'])
  })

  it('respects the existing filters', () => {
    expect(groups({ kind: 'income' }).map((g) => g.label)).toEqual(['Sueldo'])
    expect(groups({ categoryId: FOOD }).map((g) => g.label)).toEqual(['Comida'])
    expect(groups({ search: 'zzz' })).toEqual([])
  })

  it('returns no groups for an empty month', () => {
    expect(groupByCategory([], categories)).toEqual([])
  })
})
