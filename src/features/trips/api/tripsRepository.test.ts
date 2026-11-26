import {
  addTripExpense,
  createTrip,
  isTripsNotEnabled,
  listGroupTrips,
  listTripExpenses,
  listTrips,
  setGroupTrip,
  updateTrip,
} from './tripsRepository'

const sb = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = []
  let result: { data: unknown; error: unknown } = { data: [], error: null }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'order', 'not', 'eq']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return builder
    }
  }
  builder.single = () => Promise.resolve(result)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return {
    calls,
    set: (r: { data: unknown; error: unknown }) => (result = r),
    from: vi.fn((table: string) => {
      calls.push({ method: 'from', args: [table] })
      return builder
    }),
    rpc: vi.fn(() => Promise.resolve(result)),
  }
})
vi.mock('@/shared/lib/supabase', () => ({
  supabase: null,
  getSupabase: () => ({ from: sb.from, rpc: sb.rpc }),
}))

beforeEach(() => {
  sb.calls.length = 0
  sb.from.mockClear()
  sb.rpc.mockClear()
})

const tripRow = {
  id: 't1',
  owner_id: 'u1',
  name: 'Salta',
  starts_on: '2026-12-10',
  ends_on: '2026-12-17',
  budget: 500000,
  archived_at: null,
  created_at: '',
  updated_at: '',
}

describe('tripsRepository', () => {
  it("reads the person's trips with the budget in cents", async () => {
    sb.set({ data: [tripRow], error: null })
    await expect(listTrips()).resolves.toEqual([
      {
        id: 't1',
        name: 'Salta',
        startsOn: '2026-12-10',
        endsOn: '2026-12-17',
        budgetCents: 500_000_00,
        archivedAt: null,
        icon: null,
        destination: null,
        currency: 'ARS',
        funding: null,
      },
    ])
    expect(sb.calls[0]).toEqual({ method: 'from', args: ['trips'] })
  })

  it('creates a trip sending the budget as a number, never the owner', async () => {
    sb.set({ data: tripRow, error: null })
    await createTrip({
      name: 'Salta',
      startsOn: '2026-12-10',
      endsOn: '2026-12-17',
      budgetCents: 500_000_00,
    })
    const insert = sb.calls.find((c) => c.method === 'insert')
    expect(insert?.args[0]).toEqual({
      name: 'Salta',
      starts_on: '2026-12-10',
      ends_on: '2026-12-17',
      budget: 500000,
      destination: null,
      currency: 'ARS',
      fund_source: null,
      fund_account_id: null,
      fund_ahorro_currency: null,
    })
  })

  it('edits destination, dates and budget of one trip (and only those fields)', async () => {
    sb.set({ data: { ...tripRow, name: 'Salta y Jujuy', budget: 700000 }, error: null })
    const updated = await updateTrip('t1', {
      name: 'Salta y Jujuy',
      startsOn: '2026-12-10',
      endsOn: '2026-12-20',
      budgetCents: 700_000_00,
    })
    expect(updated.name).toBe('Salta y Jujuy')
    expect(sb.calls.find((c) => c.method === 'update')?.args[0]).toEqual({
      name: 'Salta y Jujuy',
      starts_on: '2026-12-10',
      ends_on: '2026-12-20',
      budget: 700000,
      destination: null,
      currency: 'ARS',
      fund_source: null,
      fund_account_id: null,
      fund_ahorro_currency: null,
    })
    expect(sb.calls).toContainEqual({ method: 'eq', args: ['id', 't1'] })
  })

  it('reads the expenses of the trips from the movements table: posted ones with a trip', async () => {
    sb.set({ data: [], error: null })
    await listTripExpenses()
    expect(sb.calls).toEqual(
      expect.arrayContaining([
        { method: 'from', args: ['transactions'] },
        { method: 'not', args: ['trip_id', 'is', null] },
        { method: 'eq', args: ['status', 'posted'] },
      ]),
    )
  })

  it('reads group trips and sets them through the RPC', async () => {
    sb.set({
      data: [
        {
          group_id: 'g1',
          starts_on: '2026-12-20',
          ends_on: '2026-12-30',
          budget: 900000,
          updated_by: 'u1',
        },
      ],
      error: null,
    })
    await expect(listGroupTrips()).resolves.toEqual([
      { groupId: 'g1', startsOn: '2026-12-20', endsOn: '2026-12-30', budgetCents: 900_000_00, destination: null, currency: 'ARS' },
    ])
    sb.set({ data: null, error: null })
    await setGroupTrip('g1', {
      startsOn: '2026-12-20',
      endsOn: '2026-12-30',
      budgetCents: 900_000_00,
    })
    expect(sb.rpc).toHaveBeenCalledWith('set_group_trip', {
      p_group: 'g1',
      p_starts_on: '2026-12-20',
      p_ends_on: '2026-12-30',
      p_budget: 900000,
      p_destination: null,
      p_currency: 'ARS',
    })
  })

  it('a trip with no budget is stored as null and read back as 0 (no budget)', async () => {
    sb.set({ data: { ...tripRow, budget: null, destination: 'Floripa', currency: 'USD', fund_source: 'savings', fund_account_id: null, fund_ahorro_currency: 'USD' }, error: null })
    const trip = await createTrip({
      name: 'Brasil',
      startsOn: '2026-12-10',
      endsOn: '2026-12-17',
      budgetCents: 0,
      destination: ' Floripa ',
      currency: 'USD',
      funding: { source: 'savings', accountId: null, ahorroCurrency: 'USD' },
    })
    expect(sb.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      budget: null,
      destination: 'Floripa',
      currency: 'USD',
      fund_source: 'savings',
      fund_ahorro_currency: 'USD',
    })
    expect(trip.budgetCents).toBe(0)
    expect(trip.funding).toEqual({ source: 'savings', accountId: null, ahorroCurrency: 'USD' })
  })

  it('one expense goes to the server with its origin of money in a single call', async () => {
    sb.set({ data: { transaction_id: 'tx1', side_expense_id: null }, error: null })
    await expect(
      addTripExpense({
        tripId: 't1',
        amountCents: 20_000,
        currency: 'USD',
        fxRate: 1200,
        description: ' Seña ',
        categoryKey: 'alojamiento',
        funding: { source: 'balance', accountId: 'a1', ahorroCurrency: null },
        bookingId: 'b1',
      }),
    ).resolves.toEqual({ transactionId: 'tx1', sideExpenseId: null })
    expect(sb.rpc).toHaveBeenCalledWith('add_trip_expense', {
      p_trip: 't1',
      p_amount: 200,
      p_currency: 'USD',
      p_fx_rate: 1200,
      p_description: 'Seña',
      p_on: null,
      p_category: 'alojamiento',
      p_funding: 'balance',
      p_account: 'a1',
      p_ahorro_currency: null,
      p_booking: 'b1',
    })
  })

  it('surfaces database errors', async () => {
    const error = { code: '42501', message: 'denied' }
    sb.set({ data: null, error })
    await expect(listTrips()).rejects.toBe(error)
  })

  it.each([
    ['PGRST205', true],
    ['PGRST202', true],
    ['42P01', true],
    ['42501', false],
    [undefined, false],
  ])('knows when the trips migration is missing (%s)', (code, expected) => {
    expect(isTripsNotEnabled({ code })).toBe(expected)
  })
})
