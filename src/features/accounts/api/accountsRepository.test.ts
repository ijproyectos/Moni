import {
  adjustAccountBalance,
  classifyOpeningBalance,
  createAccount,
  updateAccount,
} from './accountsRepository'

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

  it('an ordinary account without starting money is a plain insert', async () => {
    await createAccount({ ...none, name: 'Caja', kind: 'cash', openingBalance: 0 })
    // No card columns and no opening balance: ordinary accounts never touch them.
    expect(insert).toHaveBeenCalledWith({ name: 'Caja', kind: 'cash', opening_balance: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('starting money goes in as one movement created with the account, never as opening_balance', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    await createAccount(
      { ...none, name: 'Galicia', kind: 'bank', openingBalance: 200_000_00 },
      { source: 'previous', categoryId: null, occurredOn: '2026-10-29' },
    )
    expect(rpc).toHaveBeenCalledWith('create_account_with_opening', {
      p_name: 'Galicia',
      p_kind: 'bank',
      p_amount: 200000,
      p_source: 'previous',
      p_category: null,
      p_on: null,
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('"Mi sueldo" and "Otro ingreso" are real incomes with category and date', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    await createAccount(
      { ...none, name: 'Galicia', kind: 'bank', openingBalance: 200_000_00 },
      { source: 'salary', categoryId: 'cat-sueldo', occurredOn: '2026-10-05' },
    )
    expect(rpc).toHaveBeenCalledWith('create_account_with_opening', {
      p_name: 'Galicia',
      p_kind: 'bank',
      p_amount: 200000,
      p_source: 'income',
      p_category: 'cat-sueldo',
      p_on: '2026-10-05',
    })
  })

  it('without an explicit origin the starting money is "Saldo inicial", never an income', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    await createAccount({ ...none, name: 'Caja', kind: 'cash', openingBalance: 5_000_00 })
    expect(rpc).toHaveBeenCalledWith(
      'create_account_with_opening',
      expect.objectContaining({ p_source: 'previous', p_category: null }),
    )
  })

  it('a failed creation surfaces the database error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'category_kind_mismatch' },
    })
    await expect(
      createAccount(
        { ...none, name: 'X', kind: 'bank', openingBalance: 100 },
        { source: 'other', categoryId: 'c', occurredOn: '2026-10-05' },
      ),
    ).rejects.toMatchObject({ message: 'category_kind_mismatch' })
  })

  it('classifying an existing account asks the database to move its balance into a movement', async () => {
    rpc.mockResolvedValue({ data: 200000, error: null })
    const cents = await classifyOpeningBalance('a1', {
      source: 'salary',
      categoryId: 'cat-sueldo',
      occurredOn: '2026-10-05',
    })
    expect(rpc).toHaveBeenCalledWith('classify_opening_balance', {
      p_account: 'a1',
      p_source: 'income',
      p_category: 'cat-sueldo',
      p_on: '2026-10-05',
    })
    expect(cents).toBe(200_000_00)
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
