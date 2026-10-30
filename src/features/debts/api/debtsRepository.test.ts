import {
  cancelPaymentReport,
  confirmPaymentReport,
  isDebtsNotEnabled,
  listNotices,
  listPaymentReports,
  markNoticesRead,
  rejectPaymentReport,
  remindDebt,
  reportPayment,
} from './debtsRepository'

const sb = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  const state = { result: { data: [] as unknown, error: null as unknown } }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'order', 'limit', 'is']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(state.result).then(resolve)
  return {
    calls,
    state,
    from: vi.fn((table: string) => {
      calls.push({ method: 'from', args: [table] })
      return builder
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      calls.push({ method: `rpc:${name}`, args: [args] })
      return Promise.resolve(state.result)
    }),
  }
})
vi.mock('@/shared/lib/supabase', () => ({
  supabase: null,
  getSupabase: () => ({ from: sb.from, rpc: sb.rpc }),
}))

beforeEach(() => {
  sb.calls.length = 0
  sb.state.result = { data: [], error: null }
})
const rpcArgs = (name: string) => sb.calls.find((c) => c.method === `rpc:${name}`)?.args[0]

describe('debtsRepository', () => {
  it('reads reports and notices with amounts in cents', async () => {
    sb.state.result = {
      data: [
        {
          id: 'r1',
          group_id: 'g',
          from_user: 'b',
          to_user: 'a',
          amount: 30000,
          status: 'reported',
          settlement_id: null,
          reported_at: 't',
          resolved_at: null,
        },
      ],
      error: null,
    }
    await expect(listPaymentReports()).resolves.toEqual([
      {
        id: 'r1',
        groupId: 'g',
        fromUserId: 'b',
        toUserId: 'a',
        amountCents: 30_000_00,
        status: 'reported',
        reportedAt: 't',
        resolvedAt: null,
      },
    ])
    sb.state.result = {
      data: [
        {
          id: 'n1',
          kind: 'debt_reminder',
          group_id: 'g',
          group_name: 'Casa',
          actor_id: 'a',
          actor_name: 'Ana',
          amount: 30000,
          report_id: null,
          transfer_label: 'Galicia',
          transfer_alias: 'ana.galicia',
          transfer_cbu: null,
          created_at: 't',
          read_at: null,
        },
      ],
      error: null,
    }
    const [notice] = await listNotices()
    expect(notice).toMatchObject({
      actorName: 'Ana',
      amountCents: 30_000_00,
      transferAlias: 'ana.galicia',
    })
  })

  it('a reminder sends the amount as a number and only the account the person chose', async () => {
    await remindDebt({
      groupId: 'g',
      debtorId: 'b',
      amountCents: 30_000_00,
      account: {
        label: 'Galicia',
        alias: 'ana.galicia',
        cbu: '0070000030000012345678',
        numberLabel: 'CBU',
        kindLabel: 'Banco',
      },
    })
    expect(rpcArgs('remind_debt')).toEqual({
      p_group: 'g',
      p_debtor: 'b',
      p_amount: 30000,
      p_transfer_label: 'Galicia',
      p_transfer_alias: 'ana.galicia',
      p_transfer_cbu: '0070000030000012345678',
    })
    sb.calls.length = 0
    await remindDebt({ groupId: 'g', debtorId: 'b', amountCents: 100, account: null })
    expect(rpcArgs('remind_debt')).toMatchObject({
      p_transfer_label: null,
      p_transfer_alias: null,
      p_transfer_cbu: null,
    })
  })

  it('reports, confirms, rejects and cancels through the database functions', async () => {
    await reportPayment({ groupId: 'g', creditorId: 'a', amountCents: 30_000_00 })
    expect(rpcArgs('report_payment')).toEqual({ p_group: 'g', p_creditor: 'a', p_amount: 30000 })
    sb.state.result = { data: 'settlement-1', error: null }
    await expect(confirmPaymentReport('r1')).resolves.toBe(true)
    sb.state.result = { data: null, error: null }
    // NULL: the debt had already been settled another way and nothing was recorded.
    await expect(confirmPaymentReport('r1')).resolves.toBe(false)
    await rejectPaymentReport('r1')
    await cancelPaymentReport('r1')
    expect(rpcArgs('reject_payment_report')).toEqual({ p_report: 'r1' })
    expect(rpcArgs('cancel_payment_report')).toEqual({ p_report: 'r1' })
  })

  it('marks only the unread ones as read', async () => {
    await markNoticesRead()
    expect(sb.calls).toContainEqual({ method: 'is', args: ['read_at', null] })
  })

  it('surfaces database errors and knows when the migration is missing', async () => {
    const error = { code: 'P0001', message: 'reminder_too_soon' }
    sb.state.result = { data: null, error }
    await expect(
      remindDebt({ groupId: 'g', debtorId: 'b', amountCents: 100, account: null }),
    ).rejects.toBe(error)
    expect(isDebtsNotEnabled({ code: 'PGRST205' })).toBe(true)
    expect(isDebtsNotEnabled({ code: '42P01' })).toBe(true)
    expect(isDebtsNotEnabled({ code: '54000' })).toBe(false)
  })
})
