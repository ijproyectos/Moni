import { computeSplit, simplifyDebts, SplitError, validateSplit } from './split'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const D = '44444444-4444-4444-4444-444444444444'

const shares = (input: Parameters<typeof computeSplit>[0]) =>
  Object.fromEntries(computeSplit(input).map((s) => [s.userId, s.shareCents]))

describe('computeSplit (mirrors create_shared_expense)', () => {
  it('gives the extra cent to the payer when they participate: 100.00 / 3', () => {
    const result = shares({
      method: 'equal',
      totalCents: 10000,
      payerId: A,
      participantIds: [B, D, A],
    })
    expect(result).toEqual({ [A]: 3334, [B]: 3333, [D]: 3333 })
  })

  it('gives leftover cents by ascending user id when the payer is not in the split', () => {
    const result = shares({
      method: 'equal',
      totalCents: 10001,
      payerId: A,
      participantIds: [D, B],
    })
    expect(result).toEqual({ [B]: 5001, [D]: 5000 })
  })

  it('distributes several leftover cents: payer first, then ascending ids', () => {
    // 10 cents / 4 = 2 each, 2 left: payer D first, then A.
    const result = shares({
      method: 'equal',
      totalCents: 10,
      payerId: D,
      participantIds: [A, B, C, D],
    })
    expect(result).toEqual({ [A]: 3, [B]: 2, [C]: 2, [D]: 3 })
  })

  it('splits by percent in cents with the leftover going to the payer', () => {
    const result = computeSplit({
      method: 'percent',
      totalCents: 10001,
      payerId: A,
      participantIds: [A, B, D],
      percents: [33.33, 33.33, 33.34],
    })
    expect(result.map((s) => s.shareCents)).toEqual([3334, 3333, 3334])
    expect(result.map((s) => s.percent)).toEqual([33.33, 33.33, 33.34])
  })

  it('always adds up to the total', () => {
    for (const total of [1, 2, 3, 99, 10000, 123457, 99999999]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const ids = [
          A,
          B,
          C,
          D,
          '55555555-5555-5555-5555-555555555555',
          '66666666-6666-6666-6666-666666666666',
          '77777777-7777-7777-7777-777777777777',
        ].slice(0, n)
        const sum = computeSplit({
          method: 'equal',
          totalCents: total,
          payerId: ids[0] ?? A,
          participantIds: ids,
        }).reduce((acc, s) => acc + s.shareCents, 0)
        expect(sum).toBe(total)
      }
    }
  })

  it('handles amounts beyond 2^53 / 10000 for percent splits', () => {
    const total = 99_999_999_999_999 // 999,999,999,999.99
    const result = computeSplit({
      method: 'percent',
      totalCents: total,
      payerId: A,
      participantIds: [A, B],
      percents: [33.33, 66.67],
    })
    expect(result.reduce((acc, s) => acc + s.shareCents, 0)).toBe(total)
  })
})

describe('validateSplit', () => {
  const base = { method: 'equal', totalCents: 100, payerId: A, participantIds: [A, B] } as const

  it('rejects invalid amounts and participants', () => {
    expect(() => validateSplit({ ...base, totalCents: 0 })).toThrow(SplitError)
    expect(() => validateSplit({ ...base, participantIds: [] })).toThrow(SplitError)
    expect(() => validateSplit({ ...base, participantIds: [A, A] })).toThrow(SplitError)
  })

  it('requires percents that add up to 100', () => {
    const percent = { ...base, method: 'percent' } as const
    expect(() => validateSplit({ ...percent, percents: [50, 40] })).toThrow('percents_must_sum_100')
    expect(() => validateSplit({ ...percent, percents: [50] })).toThrow('invalid_percent')
    expect(() => validateSplit({ ...percent, percents: [0, 100] })).toThrow('invalid_percent')
    expect(() => validateSplit({ ...percent, percents: [33.333, 66.667] })).toThrow(
      'invalid_percent',
    )
    expect(() => validateSplit({ ...percent, percents: [50, 50] })).not.toThrow()
  })
})

describe('simplifyDebts', () => {
  it('returns nothing when everyone is even', () => {
    expect(simplifyDebts([{ userId: A, netCents: 0 }])).toEqual([])
  })

  it('settles a simple 3-person group with the minimum payments', () => {
    const transfers = simplifyDebts([
      { userId: A, netCents: 16667 },
      { userId: B, netCents: -8334 },
      { userId: D, netCents: -8333 },
    ])
    expect(transfers).toEqual([
      { fromUserId: B, toUserId: A, amountCents: 8334 },
      { fromUserId: D, toUserId: A, amountCents: 8333 },
    ])
  })

  it('chains debtors across creditors and zeroes every balance', () => {
    const balances = [
      { userId: A, netCents: 5000 },
      { userId: B, netCents: 3000 },
      { userId: C, netCents: -6000 },
      { userId: D, netCents: -2000 },
    ]
    const transfers = simplifyDebts(balances)
    const net = new Map(balances.map((b) => [b.userId, b.netCents]))
    for (const t of transfers) {
      net.set(t.fromUserId, (net.get(t.fromUserId) ?? 0) + t.amountCents)
      net.set(t.toUserId, (net.get(t.toUserId) ?? 0) - t.amountCents)
    }
    expect([...net.values()].every((v) => v === 0)).toBe(true)
    expect(transfers.length).toBeLessThanOrEqual(3)
  })

  it('is deterministic regardless of input order', () => {
    const a = [
      { userId: B, netCents: 100 },
      { userId: A, netCents: 100 },
      { userId: D, netCents: -100 },
      { userId: C, netCents: -100 },
    ]
    expect(simplifyDebts(a)).toEqual(simplifyDebts([...a].reverse()))
  })

  it('refuses balances that do not add up to zero', () => {
    expect(() => simplifyDebts([{ userId: A, netCents: 1 }])).toThrow()
  })
})
