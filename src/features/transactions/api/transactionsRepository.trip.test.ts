import { createTransaction, updateTransaction } from './transactionsRepository'

const sb = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'eq']) {
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
  amount: 1_500_00,
  occurredOn: '2026-10-10',
  note: 'Cena',
}
const payload = (method: string) => sb.calls.find((c) => c.method === method)?.args[0]

beforeEach(() => {
  sb.calls.length = 0
})

describe('trip link of a movement', () => {
  it('a new expense is saved with its trip only when it has one', async () => {
    await createTransaction({ ...values, tripId: 't1' })
    expect(payload('insert')).toMatchObject({ trip_id: 't1', amount: 1500 })
    sb.calls.length = 0
    await createTransaction(values)
    expect(payload('insert')).not.toHaveProperty('trip_id')
  })

  it('linking an existing expense updates the SAME row, touching only what changed', async () => {
    await updateTransaction('e1', values, 't1')
    expect(sb.calls.map((c) => c.method)).toEqual(['update', 'eq'])
    expect(sb.calls[1]?.args).toEqual(['id', 'e1'])
    expect(payload('update')).toMatchObject({ trip_id: 't1', amount: 1500 })
  })

  it('unlinking sends null; leaving it alone sends nothing about trips', async () => {
    await updateTransaction('e1', values, null)
    expect(payload('update')).toHaveProperty('trip_id', null)
    sb.calls.length = 0
    await updateTransaction('e1', values)
    expect(payload('update')).not.toHaveProperty('trip_id')
  })
})
