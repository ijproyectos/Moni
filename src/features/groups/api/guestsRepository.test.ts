import {
  createGuestExpense,
  createGuestSettlement,
  linkGroupGuest,
  listGuestState,
  voidGuestSettlement,
} from './guestsRepository'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: db.rpc,
    from: (table: string) => {
      const chain = {
        select: () => chain,
        is: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: db.tables[table] ?? [], error: null }),
      }
      return chain
    },
  }),
}))

beforeEach(() => {
  db.rpc.mockReset().mockResolvedValue({ data: 'new-id', error: null })
  db.tables = {}
})

describe('guestsRepository', () => {
  it('groups the stored guests, expenses and payments by group, with exact cents', async () => {
    db.tables = {
      group_guests: [
        { id: 'f1', group_id: 'g1', name: 'Fran', alias: 'fran.mp' },
        { id: 'f2', group_id: 'g2', name: 'Lola', alias: '' },
      ],
      group_guest_expenses: [
        {
          id: 'e1',
          group_id: 'g1',
          description: 'Cena',
          amount: 1234.56,
          template_slug: null,
          method_label: 'por monto',
          occurred_on: '2026-10-20',
          created_by: 'u1',
          created_at: '2026-10-20T10:00:00Z',
        },
      ],
      group_guest_expense_parts: [
        { expense_id: 'e1', group_id: 'g1', person_id: 'u1', role: 'payer', amount: 1234.56 },
        { expense_id: 'e1', group_id: 'g1', person_id: 'f1', role: 'share', amount: 1000.01 },
        { expense_id: 'e1', group_id: 'g1', person_id: 'u1', role: 'share', amount: 234.55 },
      ],
      group_guest_settlements: [
        {
          id: 's1',
          group_id: 'g1',
          from_person: 'f1',
          to_person: 'u1',
          amount: 500,
          method: 'Efectivo',
          occurred_on: '2026-10-21',
        },
      ],
    }
    const state = await listGuestState()
    expect(Object.keys(state).sort()).toEqual(['g1', 'g2'])
    expect(state.g1?.guests).toEqual([{ id: 'f1', name: 'Fran', alias: 'fran.mp' }])
    expect(state.g2?.guests).toEqual([{ id: 'f2', name: 'Lola', alias: '' }])
    expect(state.g1?.expenses[0]).toMatchObject({
      id: 'e1',
      amountCents: 123_456,
      payers: [{ personId: 'u1', cents: 123_456 }],
      shares: [
        { personId: 'f1', cents: 100_001 },
        { personId: 'u1', cents: 23_455 },
      ],
      createdBy: 'u1',
    })
    expect(state.g1?.settlements).toEqual([
      {
        id: 's1',
        fromId: 'f1',
        toId: 'u1',
        cents: 50_000,
        method: 'Efectivo',
        occurredOn: '2026-10-21',
      },
    ])
  })

  it('sends amounts in pesos to the database, never floats from cents math', async () => {
    await createGuestExpense('g1', {
      description: 'Cena',
      amountCents: 123_456,
      payers: [{ personId: 'u1', cents: 123_456 }],
      shares: [
        { personId: 'f1', cents: 100_001 },
        { personId: 'u1', cents: 23_455 },
      ],
      occurredOn: '2026-10-20',
      templateSlug: null,
      methodLabel: 'por monto',
      payerAccountId: 'acc-1',
    })
    expect(db.rpc).toHaveBeenCalledWith(
      'create_guest_expense',
      expect.objectContaining({
        p_group: 'g1',
        p_amount: 1234.56,
        p_payer_account_id: 'acc-1',
        p_payers: [{ personId: 'u1', amount: 1234.56 }],
        p_shares: [
          { personId: 'f1', amount: 1000.01 },
          { personId: 'u1', amount: 234.55 },
        ],
      }),
    )
    await createGuestSettlement('g1', {
      fromId: 'f1',
      toId: 'u1',
      cents: 50_000,
      method: 'Efectivo',
      occurredOn: '2026-10-21',
      accountId: 'acc-1',
    })
    expect(db.rpc).toHaveBeenLastCalledWith(
      'create_guest_settlement',
      expect.objectContaining({ p_from: 'f1', p_to: 'u1', p_amount: 500, p_account_id: 'acc-1' }),
    )
  })

  it('links a guest with an existing member through the database function', async () => {
    await linkGroupGuest('f1', 'u2')
    expect(db.rpc).toHaveBeenCalledWith('link_group_guest', { p_guest: 'f1', p_user: 'u2' })
  })

  it('surfaces the database error', async () => {
    db.rpc.mockResolvedValue({ data: null, error: new Error('guest_name_taken') })
    await expect(linkGroupGuest('f1', 'u2')).rejects.toThrow('guest_name_taken')
  })

  it('sends no account when the payment is only a debt settlement', async () => {
    await createGuestSettlement('g1', {
      fromId: 'f1',
      toId: 'u1',
      cents: 1_000,
      method: '',
      occurredOn: '2026-10-21',
    })
    expect(db.rpc).toHaveBeenLastCalledWith(
      'create_guest_settlement',
      expect.objectContaining({ p_account_id: null }),
    )
  })

  it('voids a payment through the database function', async () => {
    await voidGuestSettlement('s1')
    expect(db.rpc).toHaveBeenCalledWith('void_guest_settlement', { p_settlement: 's1' })
  })

  it('sends what an expense with people without an account replaces, in the same call', async () => {
    const expense = {
      description: 'Cena',
      amountCents: 10_000,
      payers: [{ personId: 'u1', cents: 10_000 }],
      shares: [{ personId: 'u1', cents: 10_000 }],
      occurredOn: '2026-10-20',
      templateSlug: null,
      methodLabel: '',
    }
    await createGuestExpense('g1', expense, { kind: 'transaction', id: 't1' })
    expect(db.rpc).toHaveBeenLastCalledWith(
      'create_guest_expense',
      expect.objectContaining({ p_replaces_kind: 'transaction', p_replaces_id: 't1' }),
    )
    await createGuestExpense('g1', expense)
    expect(db.rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('p_replaces_kind')
  })
})
