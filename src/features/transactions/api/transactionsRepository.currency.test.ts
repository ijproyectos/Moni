import { createTransaction, toTransaction, updateTransaction } from './transactionsRepository'

const sb = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'eq', 'select', 'single']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve)
  return { calls, from: vi.fn(() => builder) }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: null, getSupabase: () => ({ from: sb.from }) }))

const values = {
  kind: 'expense' as const,
  accountId: 'a1',
  categoryId: 'c1',
  amount: 2_700_000,
  occurredOn: '2026-10-10',
  note: null,
}
const usd = { currency: 'USD' as const, fxRate: 1350, originalAmountCents: 2000 }
const payload = (method: string) => sb.calls.find((c) => c.method === method)?.args[0]

beforeEach(() => {
  sb.calls.length = 0
})

describe('USD movements', () => {
  it('create sends the ARS amount plus the USD columns only for dollars', async () => {
    await createTransaction({ ...values, ...usd })
    expect(payload('insert')).toMatchObject({
      amount: 27000,
      original_amount: 20,
      original_currency: 'USD',
      fx_rate: 1350,
    })
    sb.calls.length = 0
    await createTransaction(values)
    expect(payload('insert')).not.toHaveProperty('original_amount')
    expect(payload('insert')).not.toHaveProperty('fx_rate')
  })

  it('update clears the USD columns when the movement goes back to pesos', async () => {
    await updateTransaction('e1', values)
    expect(payload('update')).toMatchObject({
      original_amount: null,
      original_currency: null,
      fx_rate: null,
    })
    sb.calls.length = 0
    await updateTransaction('e1', { ...values, ...usd })
    expect(payload('update')).toMatchObject({ original_amount: 20, fx_rate: 1350 })
  })

  it('maps the columns of a row to cents, null for pesos', () => {
    const row = {
      id: 't',
      account_id: 'a',
      category_id: 'c',
      kind: 'expense',
      amount: 27000,
      occurred_on: '2026-10-10',
      note: null,
      status: 'posted',
      voided_at: null,
      shared_expense_id: null,
      settlement_id: null,
      created_at: '',
      updated_at: '',
      original_amount: 20.5,
      original_currency: 'USD',
      fx_rate: 1350,
    } as unknown as Parameters<typeof toTransaction>[0]
    expect(toTransaction(row)).toMatchObject({
      originalAmountCents: 2050,
      originalCurrency: 'USD',
      fxRate: 1350,
    })
    expect(
      toTransaction({ ...row, original_amount: null, original_currency: null, fx_rate: null }),
    ).toMatchObject({ originalAmountCents: null, originalCurrency: null, fxRate: null })
  })
})
