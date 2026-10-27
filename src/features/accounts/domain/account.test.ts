import { accountFormSchema, availableBalance, type Account } from './account'

const account = (overrides: Partial<Account>): Account => ({
  id: 'a',
  name: 'Efectivo',
  kind: 'cash',
  currency: 'ARS',
  openingBalanceCents: 0,
  balanceCents: 0,
  archivedAt: null,
  ...overrides,
})

describe('accountFormSchema', () => {
  it('converts the opening balance to cents', () => {
    const parsed = accountFormSchema.parse({
      name: ' Caja ',
      kind: 'cash',
      openingBalance: '1.500,50',
    })
    expect(parsed).toEqual({ name: 'Caja', kind: 'cash', openingBalance: 150050 })
  })

  it('defaults an empty opening balance to zero', () => {
    expect(
      accountFormSchema.parse({ name: 'Caja', kind: 'bank', openingBalance: '' }).openingBalance,
    ).toBe(0)
  })

  it('rejects invalid amounts and empty names', () => {
    expect(
      accountFormSchema.safeParse({ name: 'Caja', kind: 'bank', openingBalance: 'abc' }).success,
    ).toBe(false)
    expect(
      accountFormSchema.safeParse({ name: '  ', kind: 'bank', openingBalance: '0' }).success,
    ).toBe(false)
  })
})

describe('availableBalance', () => {
  it('ignores archived accounts', () => {
    const total = availableBalance([
      account({ balanceCents: 1000 }),
      account({ balanceCents: 500 }),
      account({ balanceCents: 99999, archivedAt: '2026-10-01T00:00:00Z' }),
    ])
    expect(total).toBe(1500)
  })
})
