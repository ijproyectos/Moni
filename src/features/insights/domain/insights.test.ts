import type { CategorySlice } from '@/features/dashboard/domain/monthSummary'
import type { Subscription, SubscriptionCharge } from '@/features/subscriptions/domain/subscription'
import type { AntExpenses } from './ants'
import {
  antInsight,
  dismissInsight,
  loadDismissed,
  subscriptionInsights,
  unusualInsights,
  visibleInsights,
} from './insights'

const ants: AntExpenses = {
  month: '2026-11-01',
  thresholdCents: 10_000_00,
  monthTotalCents: 40_000_00,
  shareOfExpenses: 10,
  groups: [
    {
      categoryId: 'c1',
      categoryName: 'Café',
      color: '#fff',
      icon: 'coffee',
      label: 'Café',
      count: 9,
      totalCents: 25_000_00,
      averageCents: 2_700_00,
      yearlyProjectionCents: 300_000_00,
    },
    {
      categoryId: 'c2',
      categoryName: 'Kiosco',
      color: '#fff',
      icon: 'store',
      label: 'Kiosco',
      count: 5,
      totalCents: 15_000_00,
      averageCents: 3_000_00,
      yearlyProjectionCents: 180_000_00,
    },
  ],
}

describe('antInsight', () => {
  it('adds the groups up and converts the month into a weekly figure', () => {
    expect(antInsight(ants)).toEqual({
      kind: 'ant',
      key: 'ant:2026-11',
      labels: ['Café', 'Kiosco'],
      yearlyCents: 480_000_00,
      weeklyCents: Math.round((40_000_00 * 12) / 52),
      count: 14,
    })
  })

  it('does not exist without ants', () => {
    expect(antInsight(undefined)).toBeNull()
    expect(antInsight({ ...ants, groups: [], monthTotalCents: 0 })).toBeNull()
  })
})

const sub = (over: Partial<Subscription> = {}) =>
  ({ id: 's1', name: 'Netflix', status: 'active', period: 'monthly', ...over }) as Subscription
const charge = (dueOn: string, amountCents: number, over: Partial<SubscriptionCharge> = {}) =>
  ({
    id: dueOn,
    subscriptionId: 's1',
    dueOn,
    amountCents,
    status: 'posted',
    voidedElsewhere: false,
    ...over,
  }) as SubscriptionCharge

describe('subscriptionInsights', () => {
  it('detects a price increase between the last two posted charges', () => {
    const [i] = subscriptionInsights(
      [sub()],
      [charge('2026-09-05', 11_999_00), charge('2026-10-05', 11_999_00), charge('2026-11-05', 14_159_00)],
    )
    expect(i).toMatchObject({ kind: 'subscription', name: 'Netflix', percent: 18, fromCents: 11_999_00, toCents: 14_159_00 })
    expect(i?.key).toBe('sub:s1:2026-11-05')
  })

  it('ignores a single charge, equal prices, drops, voided and inactive subscriptions', () => {
    expect(subscriptionInsights([sub()], [charge('2026-11-05', 100_00)])).toEqual([])
    expect(subscriptionInsights([sub()], [charge('2026-10-05', 100_00), charge('2026-11-05', 100_00)])).toEqual([])
    expect(subscriptionInsights([sub()], [charge('2026-10-05', 200_00), charge('2026-11-05', 100_00)])).toEqual([])
    expect(
      subscriptionInsights([sub()], [charge('2026-10-05', 100_00), charge('2026-11-05', 200_00, { voidedElsewhere: true })]),
    ).toEqual([])
    expect(
      subscriptionInsights([sub({ status: 'paused' })], [charge('2026-10-05', 100_00), charge('2026-11-05', 200_00)]),
    ).toEqual([])
  })
})

const slice = (categoryId: string, amountCents: number): CategorySlice => ({
  categoryId,
  name: categoryId,
  color: '#000',
  icon: 'x',
  amountCents,
  percent: 0,
})

describe('unusualInsights', () => {
  it('flags a category at 1.5x its own average and 10.000 above it', () => {
    const r = unusualInsights(
      [slice('food', 300_000_00), slice('bus', 30_000_00)],
      [[slice('food', 180_000_00)], [slice('food', 220_000_00)], [slice('food', 200_000_00)]],
      '2026-11-01',
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'unusual', categoryName: 'food', averageCents: 200_000_00, percent: 50 })
    expect(r[0]?.key).toBe('unusual:2026-11:food')
  })

  it('needs two months of history and a real difference', () => {
    expect(unusualInsights([slice('food', 300_000_00)], [[slice('food', 100_000_00)]], '2026-11-01')).toEqual([])
    expect(
      unusualInsights([slice('x', 14_000_00)], [[slice('x', 5_000_00)], [slice('x', 5_000_00)]], '2026-11-01'),
    ).toEqual([])
    expect(
      unusualInsights([slice('food', 150_000_00)], [[slice('food', 100_000_00)], [slice('food', 100_000_00)]], '2026-11-01'),
    ).toHaveLength(1)
    expect(
      unusualInsights([slice('food', 140_000_00)], [[slice('food', 100_000_00)], [slice('food', 100_000_00)]], '2026-11-01'),
    ).toEqual([])
  })

  it('skips shared-expense virtual categories', () => {
    expect(
      unusualInsights([slice('template:none', 900_000_00)], [[slice('template:none', 1_00)], [slice('template:none', 1_00)]], '2026-11-01'),
    ).toEqual([])
  })
})

describe('dismissals', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }

  it('persists keys and filters them out', () => {
    const storage = memory()
    expect(loadDismissed(storage).size).toBe(0)
    dismissInsight('a', storage)
    const set = dismissInsight('b', storage)
    expect([...set]).toEqual(['a', 'b'])
    expect([...loadDismissed(storage)]).toEqual(['a', 'b'])
    const ant = antInsight(ants)
    if (!ant) throw new Error('expected insight')
    const insights = [ant]
    expect(visibleInsights(insights, new Set(['ant:2026-11']))).toEqual([])
    expect(visibleInsights(insights, new Set())).toHaveLength(1)
  })

  it('survives broken storage', () => {
    expect(loadDismissed({ getItem: () => '{not json', setItem: () => undefined }).size).toBe(0)
    expect(() =>
      dismissInsight('a', {
        getItem: () => null,
        setItem: () => {
          throw new Error('full')
        },
      }),
    ).not.toThrow()
    expect(loadDismissed(null).size).toBe(0)
  })
})
