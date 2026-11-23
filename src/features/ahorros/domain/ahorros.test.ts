import { balanceOf, formatSaving, toEntry, type AhorroEntry, type AhorroRow } from './ahorros'

const entry = (over: Partial<AhorroEntry>): AhorroEntry => ({
  id: 'x',
  currency: 'ARS',
  kind: 'deposit',
  amountCents: 100_00,
  occurredOn: '2026-11-01',
  note: null,
  accountId: null,
  status: 'posted',
  createdAt: '',
  ...over,
})

describe('ahorros', () => {
  it('adds each currency on its own and ignores voided entries', () => {
    const list = [
      entry({ kind: 'opening', amountCents: 500_00 }),
      entry({ kind: 'deposit', amountCents: 200_00 }),
      entry({ kind: 'withdrawal', amountCents: 50_00 }),
      entry({ kind: 'deposit', amountCents: 999_00, status: 'voided' }),
      entry({ currency: 'USD', kind: 'opening', amountCents: 300_00 }),
    ]
    expect(balanceOf(list, 'ARS')).toBe(650_00)
    expect(balanceOf(list, 'USD')).toBe(300_00)
  })

  it('formats each currency with its own symbol', () => {
    expect(formatSaving(150_000_00, 'ARS')).toBe('$150.000')
    expect(formatSaving(300_50, 'USD')).toBe('US$ 300,5')
  })

  it('reads a row from the database', () => {
    const row: AhorroRow = {
      id: 'a',
      currency: 'USD',
      kind: 'opening',
      amount: '1250.50',
      occurred_on: '2026-01-01',
      note: null,
      account_id: null,
      status: 'posted',
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(toEntry(row).amountCents).toBe(125_050)
  })
})
