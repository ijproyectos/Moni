import { adjustAccountBalance, createAccount, updateAccount } from './accountsRepository'

const insert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const update = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({ insert, update }),
    rpc,
  }),
}))

const none = { creditLimit: null, closingDay: null, dueDay: null }

describe('accountsRepository', () => {
  beforeEach(() => {
    insert.mockClear()
    update.mockReset()
    update.mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
    rpc.mockReset()
  })

  it('stores the starting debt of a card as a negative opening balance', async () => {
    await createAccount({
      name: 'Visa',
      kind: 'credit_card',
      openingBalance: 50_000_00,
      creditLimit: 500_000_00,
      closingDay: 25,
      dueDay: 5,
    })
    expect(insert).toHaveBeenCalledWith({
      name: 'Visa',
      kind: 'credit_card',
      opening_balance: -50000,
      credit_limit: 500000,
      closing_day: 25,
      due_day: 5,
    })
  })

  it('keeps the opening balance of a regular account as typed', async () => {
    await createAccount({ ...none, name: 'Caja', kind: 'cash', openingBalance: 1_500_50 })
    // No card columns at all: ordinary accounts never touch them.
    expect(insert).toHaveBeenCalledWith({ name: 'Caja', kind: 'cash', opening_balance: 1500.5 })
  })

  it('applies the same rule when editing', async () => {
    await updateAccount('a1', {
      ...none,
      name: 'Visa',
      kind: 'credit_card',
      openingBalance: 10_000_00,
      closingDay: 10,
      dueDay: 20,
    })
    expect(update).toHaveBeenCalledWith({
      name: 'Visa',
      kind: 'credit_card',
      opening_balance: -10000,
      credit_limit: null,
      closing_day: 10,
      due_day: 20,
    })
  })

  it('clears the card settings when a card becomes another kind of account', async () => {
    await updateAccount(
      'a1',
      { ...none, name: 'Caja', kind: 'cash', openingBalance: 0 },
      'credit_card',
    )
    expect(update).toHaveBeenCalledWith({
      name: 'Caja',
      kind: 'cash',
      opening_balance: 0,
      credit_limit: null,
      closing_day: null,
      due_day: null,
    })
  })

  it('does not send card columns when editing an ordinary account', async () => {
    await updateAccount('a1', { ...none, name: 'Caja', kind: 'cash', openingBalance: 0 }, 'cash')
    expect(update).toHaveBeenCalledWith({ name: 'Caja', kind: 'cash', opening_balance: 0 })
  })

  it('adjusts through the database function and returns the difference in cents', async () => {
    rpc.mockResolvedValue({ data: 14000, error: null })
    const delta = await adjustAccountBalance('a1', 20_000_00, '  Conté la caja ')
    expect(rpc).toHaveBeenCalledWith('adjust_account_balance', {
      p_account: 'a1',
      p_target: 20000,
      p_note: 'Conté la caja',
    })
    expect(delta).toBe(14_000_00)
  })

  it('surfaces database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23503', message: 'account_not_found' } })
    await expect(adjustAccountBalance('x', 0)).rejects.toMatchObject({
      message: 'account_not_found',
    })
  })
})
