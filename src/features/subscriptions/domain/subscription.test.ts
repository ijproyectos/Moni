import {
  monthlyEstimateCents,
  needsAttention,
  parseSubscriptionOverview,
  remindersFor,
  upcomingCharges,
  yearlyEstimateCents,
  type Subscription,
  type SubscriptionCharge,
} from './subscription'

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's1',
  serviceId: 'netflix',
  name: 'Netflix',
  plan: null,
  amountCents: 18_000_00,
  period: 'monthly',
  nextChargeOn: '2026-11-18',
  accountId: 'a1',
  accountName: 'Galicia',
  accountKind: 'bank',
  categoryId: 'c1',
  remind: true,
  status: 'active',
  ...over,
})

const charge = (over: Partial<SubscriptionCharge> = {}): SubscriptionCharge => ({
  id: 'ch1',
  subscriptionId: 's1',
  dueOn: '2026-10-18',
  amountCents: 18_000_00,
  status: 'posted',
  voidedElsewhere: false,
  failureReason: null,
  negativeBalance: false,
  overLimit: false,
  balanceAfterCents: null,
  possibleDuplicate: null,
  ...over,
})

describe('subscription totals', () => {
  it('counts only active ones; a yearly subscription is a twelfth per month', () => {
    const subs = [
      sub({ amountCents: 18_000_00 }),
      sub({ id: 's2', period: 'yearly', amountCents: 120_000_00 }),
      sub({ id: 's3', status: 'paused', amountCents: 99_000_00 }),
      sub({ id: 's4', status: 'cancelled', amountCents: 99_000_00 }),
    ]
    expect(monthlyEstimateCents(subs)).toBe(18_000_00 + 10_000_00)
    expect(yearlyEstimateCents(subs)).toBe(18_000_00 * 12 + 120_000_00)
  })
})

describe('monthly estimate rounding', () => {
  it('rounds a yearly share to whole pesos', () => {
    expect(monthlyEstimateCents([sub({ period: 'yearly', amountCents: 95_000_00 })])).toBe(7_917_00)
  })
})

describe('reminders', () => {
  it('reminds exactly one day before, with the account name', () => {
    const subs = [sub({ nextChargeOn: '2026-11-18' })]
    expect(remindersFor(subs, '2026-11-17')).toEqual([
      { subscriptionId: 's1', text: 'Mañana se cobra Netflix: $18.000 de Galicia' },
    ])
    expect(remindersFor(subs, '2026-11-16')).toEqual([])
    expect(remindersFor(subs, '2026-11-18')).toEqual([])
  })

  it('crosses month and year ends', () => {
    expect(remindersFor([sub({ nextChargeOn: '2027-01-01' })], '2026-12-31')).toHaveLength(1)
  })

  it('skips paused, cancelled and subscriptions with reminders off', () => {
    const date = { nextChargeOn: '2026-11-18' }
    const subs = [
      sub({ ...date, status: 'paused' }),
      sub({ ...date, id: 's2', status: 'cancelled' }),
      sub({ ...date, id: 's3', remind: false }),
    ]
    expect(remindersFor(subs, '2026-11-17')).toEqual([])
  })
})

describe('upcoming charges', () => {
  it('orders active subscriptions by date and leaves the others out', () => {
    const list = upcomingCharges([
      sub({ id: 'b', name: 'Spotify', nextChargeOn: '2026-11-20' }),
      sub({ id: 'a', name: 'Netflix', nextChargeOn: '2026-11-18' }),
      sub({ id: 'c', status: 'paused', nextChargeOn: '2026-11-01' }),
    ])
    expect(list.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('charges that need attention', () => {
  it('flags negative balance, possible duplicates and failures, not voided ones', () => {
    expect(needsAttention(charge())).toBe(false)
    expect(needsAttention(charge({ negativeBalance: true }))).toBe(true)
    expect(needsAttention(charge({ overLimit: true }))).toBe(true)
    expect(
      needsAttention(
        charge({
          possibleDuplicate: { id: 't', occurredOn: '2026-10-17', note: null, amountCents: 1 },
        }),
      ),
    ).toBe(true)
    expect(needsAttention(charge({ status: 'failed' }))).toBe(true)
    expect(needsAttention(charge({ negativeBalance: true, status: 'not_charged' }))).toBe(false)
    expect(needsAttention(charge({ negativeBalance: true, voidedElsewhere: true }))).toBe(false)
  })
})

describe('parseSubscriptionOverview', () => {
  it('converts the database JSON (amounts in pesos) to cents', () => {
    const parsed = parseSubscriptionOverview({
      today: '2026-10-29',
      subscriptions: [
        {
          id: 's1',
          service_id: 'netflix',
          name: 'Netflix',
          plan: 'Estándar',
          amount: 18000,
          period: 'monthly',
          next_charge_on: '2026-11-18',
          account_id: 'a1',
          account_name: 'Galicia',
          account_kind: 'bank',
          category_id: 'c1',
          remind: true,
          status: 'active',
        },
      ],
      charges: [
        {
          id: 'ch1',
          subscription_id: 's1',
          due_on: '2026-10-18',
          amount: 18000.5,
          status: 'posted',
          voided_elsewhere: null,
          failure_reason: null,
          negative_balance: true,
          over_limit: null,
          balance_after: -7000,
          possible_duplicate: {
            id: 't1',
            occurred_on: '2026-10-17',
            note: 'netflix',
            amount: 18000.5,
          },
        },
      ],
    })
    expect(parsed.subscriptions[0]).toMatchObject({ amountCents: 18_000_00, plan: 'Estándar' })
    expect(parsed.charges[0]).toMatchObject({
      amountCents: 18_000_50,
      voidedElsewhere: false,
      balanceAfterCents: -7_000_00,
      possibleDuplicate: { id: 't1', amountCents: 18_000_50 },
    })
  })

  it('rejects malformed data instead of showing wrong numbers', () => {
    expect(() =>
      parseSubscriptionOverview({ today: '2026-10-29', subscriptions: [{}], charges: [] }),
    ).toThrow()
  })
})
