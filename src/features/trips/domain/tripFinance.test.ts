import { makeTransaction } from '@/features/transactions/domain/testing'
import type { TripBooking } from './bookings'
import { bookingStates, convertCents, myShareOfBooking, spendFromMovement, spendFromSide, tripFinance, valueIn } from './tripFinance'

const booking = (over: Partial<TripBooking> = {}): TripBooking => ({
  id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'hotel', title: 'Alojamiento',
  origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 700_00, currency: 'USD', payDeadline: null,
  notes: null, status: 'active', participants: [], ...over,
})
const usd = (cents: number, over: Record<string, unknown> = {}) =>
  spendFromMovement(makeTransaction({ amountCents: cents * 1200, originalAmountCents: cents, originalCurrency: 'USD', ...over }))

const base = { startsOn: '2026-12-10', endsOn: '2026-12-20', today: '2026-12-01', arsPerUsd: 1200 }

describe('un pago de una reserva se cuenta UNA vez (el ejemplo del pedido)', () => {
  // Presupuesto USD 2.000: pasajes pagos 450, seña de alojamiento 200 de 700 → pendiente 500, disponible 850.
  const flights = booking({ id: 'f', kind: 'transport', title: 'Pasajes', totalCents: 450_00 })
  const lodging = booking()
  const items = [usd(450_00, { id: 'p1', bookingId: 'f' }), usd(200_00, { id: 'p2', bookingId: 'b1' })]
  const states = bookingStates([flights, lodging], items, 1200)

  it('pending is total minus the payments that point at the booking', () => {
    expect(states[0]).toMatchObject({ paidCents: 450_00, pendingCents: 0 })
    expect(states[1]).toMatchObject({ paidCents: 200_00, pendingCents: 500_00 })
  })

  it('the trip: spent 650, pending 500, available 850 of 2.000', () => {
    const f = tripFinance({ ...base, currency: 'USD', budgetCents: 2000_00, items, bookings: states })
    expect(f.spentCents).toBe(650_00)
    expect(f.pendingCents).toBe(500_00)
    expect(f.committedCents).toBe(1150_00)
    expect(f.availableCents).toBe(850_00)
    expect(f.committedShare).toBeCloseTo(0.575)
    expect(f.overBudget).toBe(false)
  })
})

describe('sin presupuesto no se inventan números', () => {
  it('shows spent and committed only: no available, no percentages', () => {
    const states = bookingStates([booking()], [usd(200_00, { bookingId: 'b1' })], 1200)
    const f = tripFinance({ ...base, currency: 'USD', budgetCents: 0, items: [usd(200_00, { bookingId: 'b1' })], bookings: states })
    expect(f.hasBudget).toBe(false)
    expect(f.availableCents).toBeNull()
    expect(f.spentShare).toBeNull()
    expect(f.committedShare).toBeNull()
    expect(f.perDayCents).toBeNull()
    expect(f.overBudget).toBe(false)
    expect(f.committedCents).toBe(700_00)
  })
})

describe('reservas canceladas, pagadas de más y monedas', () => {
  it('a cancelled booking stops committing money but what was paid stays spent', () => {
    const items = [usd(200_00, { bookingId: 'b1' })]
    const states = bookingStates([booking({ status: 'cancelled' })], items, 1200)
    expect(states[0]?.pendingCents).toBe(0)
    const f = tripFinance({ ...base, currency: 'USD', budgetCents: 1000_00, items, bookings: states })
    expect(f.spentCents).toBe(200_00)
    expect(f.pendingCents).toBe(0)
  })

  it('paying more than the total never gives a negative pending, and says so', () => {
    const states = bookingStates([booking({ totalCents: 100_00 })], [usd(150_00, { bookingId: 'b1' })], 1200)
    expect(states[0]).toMatchObject({ pendingCents: 0, overpaid: true })
  })

  it('a peso payment of a dollar booking is converted with the rate; with no rate it is flagged, never guessed', () => {
    const peso = spendFromMovement(makeTransaction({ amountCents: 120_000_00, bookingId: 'b1' }))
    expect(bookingStates([booking()], [peso], 1200)[0]?.paidCents).toBe(100_00)
    const unknown = bookingStates([booking()], [peso], null)[0]
    expect(unknown?.paidCents).toBe(0)
    expect(unknown?.unconverted).toBe(true)
    const f = tripFinance({ ...base, currency: 'USD', budgetCents: 1000_00, items: [peso], bookings: [], arsPerUsd: null })
    expect(f.unconvertedCount).toBe(1)
    expect(f.spentCents).toBe(0)
  })

  it('a trip in dollars reads the recorded USD of a movement, not a recalculation', () => {
    const item = usd(80_00)
    expect(valueIn(item, 'USD', 999)).toBe(80_00)
    expect(valueIn(item, 'ARS', 999)).toBe(80_00 * 1200)
  })

  it('side expenses: dollars with its own rate give the pesos; pesos need a rate to be dollars', () => {
    const side = spendFromSide({ id: 's', amount: 60, currency: 'USD', fx_rate: 1000, description: 'Tour', occurred_on: '2026-12-02', trip_category: 'actividades', booking_id: null, funding: 'external' })
    expect(side.usd).toBe(60_00)
    expect(side.ars).toBe(60_000_00)
    expect(convertCents(1000_00, 'ARS', 'USD', null)).toBeNull()
    expect(convertCents(1200_00, 'ARS', 'USD', 1200)).toBe(100)
  })
})

describe('categorías y por día', () => {
  it('groups by trip category, biggest first, with its share of what was spent', () => {
    const items = [
      spendFromMovement(makeTransaction({ id: 'a', amountCents: 30_000_00, tripCategory: 'comidas' })),
      spendFromMovement(makeTransaction({ id: 'b', amountCents: 60_000_00, tripCategory: 'transporte' })),
      spendFromMovement(makeTransaction({ id: 'c', amountCents: 10_000_00 })),
    ]
    const f = tripFinance({ ...base, currency: 'ARS', budgetCents: 500_000_00, items, bookings: [], arsPerUsd: null })
    expect(f.byCategory.map((r) => r.key)).toEqual(['transporte', 'comidas', 'otros'])
    expect(f.byCategory[0]?.share).toBeCloseTo(0.6)
  })

  it('spreads what is left over the days left, only with a budget and room', () => {
    const f = tripFinance({ ...base, currency: 'ARS', budgetCents: 100_000_00, items: [], bookings: [], arsPerUsd: null, today: '2026-12-15' })
    expect(f.daysLeft).toBe(6)
    expect(f.perDayCents).toBe(Math.floor(100_000_00 / 6))
  })
})

describe('mi parte de una reserva', () => {
  it('a personal booking is all mine; a shared one is split among its participants; 0 if I am not in it', () => {
    expect(myShareOfBooking({ scope: 'personal', participants: [], totalCents: 900 }, 'me')).toBe(900)
    expect(myShareOfBooking({ scope: 'shared', participants: ['me', 'ana', 'leo'], totalCents: 900 }, 'me')).toBe(300)
    expect(myShareOfBooking({ scope: 'shared', participants: ['ana'], totalCents: 900 }, 'me')).toBe(0)
  })

  it('what a shared booking already collected (from the group) counts as paid, once', () => {
    const shared = booking({ scope: 'shared', currency: 'ARS', totalCents: 300_000_00, tripId: null, groupId: 'g1', participants: ['me', 'ana'] })
    const [state] = bookingStates([shared], [], null, new Map([['b1', 100_000_00]]))
    expect(state).toMatchObject({ paidCents: 100_000_00, pendingCents: 200_000_00 })
  })
})
