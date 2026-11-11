import { buildStatementBars, cardCeilingCents, nextStatement, purchaseTip } from './statementChart'
import type { Statement } from './overview'

const st = (over: Partial<Statement>): Statement => ({
  closingOn: '2026-11-23',
  dueOn: '2026-12-04',
  chargedCents: 100_00,
  paidCents: 0,
  remainingCents: 100_00,
  status: 'billed',
  ...over,
})

describe('cardCeilingCents', () => {
  it('is 20% of the expected income, and null without income', () => {
    expect(cardCeilingCents(1_850_000_00)).toBe(370_000_00)
    expect(cardCeilingCents(null)).toBeNull()
    expect(cardCeilingCents(0)).toBeNull()
  })
})

describe('nextStatement', () => {
  it('picks the earliest unpaid statement that has a closing date', () => {
    const list = [
      st({ closingOn: null, dueOn: null, status: 'billed' }),
      st({ closingOn: '2026-10-23', status: 'paid', remainingCents: 0 }),
      st({ closingOn: '2026-12-23', status: 'future' }),
      st({ closingOn: '2026-11-23', status: 'open' }),
    ]
    expect(nextStatement(list)?.closingOn).toBe('2026-11-23')
    expect(nextStatement([])).toBeNull()
  })
})

describe('buildStatementBars', () => {
  it('starts at the next statement, takes six at most and splits installments from the rest', () => {
    const statements = [
      st({ closingOn: '2026-10-23', status: 'paid', remainingCents: 0, paidCents: 100_00 }),
      st({ closingOn: '2026-11-23', chargedCents: 400_00, remainingCents: 400_00, status: 'open' }),
      st({ closingOn: '2026-12-23', chargedCents: 150_00, remainingCents: 150_00, status: 'future' }),
      st({ closingOn: '2027-01-23', chargedCents: 100_00, remainingCents: 100_00, status: 'future' }),
      st({ closingOn: '2027-02-23', status: 'future' }),
      st({ closingOn: '2027-03-23', status: 'future' }),
      st({ closingOn: '2027-04-23', status: 'future' }),
      st({ closingOn: '2027-05-23', status: 'future' }),
    ]
    const bars = buildStatementBars(
      statements,
      new Map([
        ['2026-11-23', 250_00],
        ['2026-12-23', 500_00],
      ]),
    )
    expect(bars).toHaveLength(6)
    expect(bars[0]).toMatchObject({
      closingOn: '2026-11-23',
      totalCents: 400_00,
      installmentsCents: 250_00,
      otherCents: 150_00,
    })
    // installments can never exceed what the statement holds
    expect(bars[1]).toMatchObject({ installmentsCents: 150_00, otherCents: 0 })
    expect(bars[2]?.installmentsCents).toBe(0)
  })

  it('is empty when nothing is pending', () => {
    expect(buildStatementBars([], new Map())).toEqual([])
  })
})

describe('purchaseTip', () => {
  it('names the statement after the next closing by its due month', () => {
    // closes the 23rd, due the 4th: after the 23rd of November the purchase closes on 23 Dec and is due 4 Jan
    expect(purchaseTip(23, 4, '2026-11-10')).toEqual({ day: 23, dueOn: '2027-01-04' })
    // already past the closing day: the next closing is in December
    expect(purchaseTip(23, 4, '2026-11-28')).toEqual({ day: 23, dueOn: '2027-02-04' })
  })

  it('falls back to the closing month without a due day, and is null without a closing day', () => {
    expect(purchaseTip(23, null, '2026-11-10')?.dueOn).toBe('2026-12-23')
    expect(purchaseTip(null, null, '2026-11-10')).toBeNull()
  })
})
