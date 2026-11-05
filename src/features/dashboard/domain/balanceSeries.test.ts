import { buildBalanceSeries } from './balanceSeries'

const acc = (id: string, over = {}) => ({
  id,
  kind: 'bank' as const,
  currency: 'ARS',
  archivedAt: null,
  ...over,
})
const tx = (over = {}) => ({
  accountId: 'a',
  kind: 'expense' as const,
  amountCents: 100,
  occurredOn: '2026-11-03',
  status: 'posted' as const,
  ...over,
})
const base = { today: '2026-11-04', transfers: [] }

describe('buildBalanceSeries', () => {
  it('rebuilds each day from today backwards and ends exactly on the current balance', () => {
    const series = buildBalanceSeries({
      ...base,
      currentCents: 1_000,
      accounts: [acc('a')],
      transactions: [
        tx({ amountCents: 300, occurredOn: '2026-11-03' }),
        tx({ kind: 'income', amountCents: 500, occurredOn: '2026-11-01' }),
      ],
      days: 5,
    })
    expect(series?.map((p) => p.cents)).toEqual([800, 1300, 1300, 1000, 1000])
    expect(series?.[4]).toEqual({ date: '2026-11-04', cents: 1_000 })
  })

  it('ignores voided movements, cards, archived and foreign-currency accounts', () => {
    const series = buildBalanceSeries({
      ...base,
      currentCents: 1_000,
      accounts: [
        acc('a'),
        acc('card', { kind: 'credit_card' }),
        acc('old', { archivedAt: '2026-01-01' }),
        acc('usd', { currency: 'USD' }),
      ],
      transactions: [
        tx({ amountCents: 50, occurredOn: '2026-11-02' }),
        tx({ amountCents: 70, occurredOn: '2026-11-03' }),
        tx({ accountId: 'card', amountCents: 999 }),
        tx({ accountId: 'old', amountCents: 999 }),
        tx({ accountId: 'usd', amountCents: 999 }),
        tx({ amountCents: 999, status: 'voided' }),
      ],
      days: 4,
    })
    expect(series?.map((p) => p.cents)).toEqual([1120, 1070, 1000, 1000])
  })

  it('counts transfers only when they cross the edge of the available money', () => {
    const series = buildBalanceSeries({
      ...base,
      currentCents: 1_000,
      accounts: [acc('a'), acc('b'), acc('card', { kind: 'credit_card' })],
      transactions: [tx({ amountCents: 10, occurredOn: '2026-11-01' })],
      transfers: [
        // Between two available accounts: no change.
        {
          fromAccountId: 'a',
          toAccountId: 'b',
          amountCents: 400,
          occurredOn: '2026-11-03',
          status: 'posted' as const,
        },
        // Paying the card: money leaves the available set.
        {
          fromAccountId: 'a',
          toAccountId: 'card',
          amountCents: 200,
          occurredOn: '2026-11-03',
          status: 'posted' as const,
        },
      ],
      days: 4,
    })
    expect(series?.map((p) => p.cents)).toEqual([1200, 1200, 1000, 1000])
    expect(series?.at(-1)?.cents).toBe(1_000)
  })

  it('gives nothing to draw when there is not enough history', () => {
    const none = buildBalanceSeries({
      ...base,
      currentCents: 0,
      accounts: [acc('a')],
      transactions: [],
    })
    const one = buildBalanceSeries({
      ...base,
      currentCents: 500,
      accounts: [acc('a')],
      transactions: [tx(), tx({ amountCents: 5 })],
    })
    const old = buildBalanceSeries({
      ...base,
      currentCents: 500,
      accounts: [acc('a')],
      transactions: [tx({ occurredOn: '2026-01-01' }), tx({ occurredOn: '2026-01-02' })],
    })
    expect([none, one, old]).toEqual([null, null, null])
  })

  it('also undoes movements dated in the future, like the account balances do', () => {
    const series = buildBalanceSeries({
      ...base,
      currentCents: 900,
      accounts: [acc('a')],
      transactions: [
        tx({ amountCents: 100, occurredOn: '2026-11-03' }),
        tx({ amountCents: 100, occurredOn: '2026-11-02' }),
        tx({ amountCents: 100, occurredOn: '2026-11-10' }),
      ],
      days: 3,
    })
    expect(series?.map((p) => p.cents)).toEqual([1100, 1000, 1000])
  })

  it('does not draw when a list cut short by the row cap no longer reaches the start of the window', () => {
    const input = {
      ...base,
      currentCents: 1_000,
      accounts: [acc('a')],
      transactions: [tx({ occurredOn: '2026-11-02' }), tx({ occurredOn: '2026-11-03' })],
      days: 5,
    }
    expect(buildBalanceSeries({ ...input, truncated: { transactions: true } })).toBeNull()
    expect(buildBalanceSeries({ ...input, truncated: { transfers: true } })).not.toBeNull()
    const reaches = {
      ...input,
      transactions: [...input.transactions, tx({ occurredOn: '2026-10-01' })],
    }
    expect(buildBalanceSeries({ ...reaches, truncated: { transactions: true } })).not.toBeNull()
  })
})
