import type { Category } from '@/features/categories/domain/category'
import { buildActivity, countEntries, type ActivityFilters } from './activity'
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
