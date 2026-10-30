import { isTransferDataNotEnabled, listAccounts, updateTransferData } from './accountsRepository'

const sb = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  const state = { results: {} as Record<string, { data: unknown; error: unknown }> }
  const make = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'update', 'eq', 'order', 'is']) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ method: `${table}.${m}`, args })
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(state.results[table] ?? { data: [], error: null }).then(resolve)
    return builder
  }
  return { calls, state, from: vi.fn((table: string) => make(table)) }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: null, getSupabase: () => ({ from: sb.from }) }))

beforeEach(() => {
  sb.calls.length = 0
  sb.state.results = {}
})

const row = {
  id: 'a1',
  owner_id: 'u1',
  name: 'Galicia',
  kind: 'bank',
  currency: 'ARS',
  opening_balance: 100,
  archived_at: null,
  created_at: '',
  updated_at: '',
}

describe('transfer data of an account', () => {
  it('is read with the account (and is null while the migration is not applied)', async () => {
    sb.state.results.accounts = {
      data: [
        { ...row, transfer_alias: 'galicia.sueldo', transfer_cbu: '0070000030000012345678' },
        { ...row, id: 'a2', name: 'Efectivo', kind: 'cash' },
      ],
      error: null,
    }
    sb.state.results.account_balances = { data: [], error: null }
    const [bank, cash] = await listAccounts(false)
    expect(bank).toMatchObject({
      transferAlias: 'galicia.sueldo',
      transferCbu: '0070000030000012345678',
    })
    expect(cash).toMatchObject({ transferAlias: null, transferCbu: null })
  })

  it('saves only the two columns of one account: the balance and the movements are not part of the update', async () => {
    await updateTransferData('a1', { alias: 'galicia.sueldo', cbu: null })
    const update = sb.calls.find((c) => c.method === 'accounts.update')
    expect(update?.args[0]).toEqual({ transfer_alias: 'galicia.sueldo', transfer_cbu: null })
    expect(sb.calls).toContainEqual({ method: 'accounts.eq', args: ['id', 'a1'] })
    expect(sb.calls.every((c) => c.method.startsWith('accounts.'))).toBe(true)
  })

  it('knows when the columns are missing (migration not applied)', () => {
    expect(isTransferDataNotEnabled({ code: '42703' })).toBe(true)
    expect(isTransferDataNotEnabled({ code: 'PGRST204' })).toBe(true)
    expect(isTransferDataNotEnabled({ code: '23514' })).toBe(false)
  })

  it('surfaces other errors', async () => {
    sb.state.results.accounts = { data: null, error: { code: '23514', message: 'check' } }
    await expect(updateTransferData('a1', { alias: null, cbu: null })).rejects.toMatchObject({
      code: '23514',
    })
  })
})
