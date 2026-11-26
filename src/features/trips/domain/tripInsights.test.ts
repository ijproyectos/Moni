import type { TripBooking } from './bookings'
import { bookingStates, tripFinance, type SpendItem } from './tripFinance'
import { tripInsights } from './tripInsights'

const booking = (over: Partial<TripBooking> = {}): TripBooking => ({
  id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'hotel', title: 'Hotel Sol',
  origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 700_00, currency: 'USD', payDeadline: null,
  notes: null, status: 'active', participants: [], ...over,
})
const item = (id: string, usd: number, category: string, bookingId: string | null = null): SpendItem => ({
  id, source: 'side', occurredOn: '2026-12-01', title: '', categoryKey: category, bookingId, funding: 'external', ars: null, usd,
})

function run(opts: { budget?: number; items?: SpendItem[]; bookings?: TripBooking[]; today?: string; status?: 'upcoming' | 'ongoing' | 'ended'; endsOn?: string }) {
  const items = opts.items ?? []
  const states = bookingStates(opts.bookings ?? [], items, null)
  const today = opts.today ?? '2026-12-01'
  const finance = tripFinance({ currency: 'USD', budgetCents: opts.budget ?? 0, startsOn: '2026-12-10', endsOn: opts.endsOn ?? '2026-12-20', today, items, bookings: states, arsPerUsd: null })
  return tripInsights({ finance, bookings: states, today, status: opts.status ?? 'upcoming' })
}

describe('recomendaciones de Moni', () => {
  it('says nothing without information (no budget, no bookings, no expenses)', () => {
    expect(run({})).toEqual([])
  })

  it('paid vs pending of the bookings, and what is left of the budget after them', () => {
    const texts = run({
      budget: 2000_00,
      bookings: [booking({ id: 'f', title: 'Pasajes', totalCents: 450_00 }), booking()],
      items: [item('1', 450_00, 'pasajes', 'f'), item('2', 200_00, 'alojamiento', 'b1')],
    }).map((i) => i.text)
    expect(texts).toContain('Ya tenés pago Pasajes. Te quedan US$ 500 de Hotel Sol.')
    expect(texts).toContain('Después de cubrir tus reservas, te quedan US$ 850 de presupuesto para disfrutar el viaje.')
  })

  it('warns the day before a payment is due, never about a paid or far one', () => {
    const near = run({ bookings: [booking({ payDeadline: '2026-12-02' })], today: '2026-12-01' }).map((i) => i.text)
    expect(near[0]).toBe('Mañana vence el pago de Hotel Sol: te faltan US$ 700.')
    expect(run({ bookings: [booking({ payDeadline: '2026-12-30' })] }).some((i) => i.id.startsWith('due'))).toBe(false)
    expect(run({ bookings: [booking({ payDeadline: '2026-12-02', totalCents: 100_00 })], items: [item('1', 100_00, 'alojamiento', 'b1')] }).some((i) => i.id.startsWith('due'))).toBe(false)
  })

  it('per day only with a budget, something left and days ahead', () => {
    const during = run({ budget: 400_00, today: '2026-12-15', status: 'ongoing', items: [item('1', 100_00, 'comidas')] }).map((i) => i.text)
    expect(during).toContain('Te quedan 6 días de viaje y US$ 300 de presupuesto. Podrías disponer de US$ 50 por día.')
    expect(run({ today: '2026-12-15', status: 'ongoing' }).some((i) => i.id === 'per-day')).toBe(false)
  })

  it('names the category that dominates only with enough expenses and a clear leader', () => {
    const many = [item('1', 90_00, 'comidas'), item('2', 80_00, 'comidas'), item('3', 70_00, 'comidas'), item('4', 20_00, 'compras'), item('5', 10_00, 'transporte')]
    expect(run({ items: many }).some((i) => i.id === 'top-category')).toBe(true)
    expect(run({ items: many.slice(0, 3) }).some((i) => i.id === 'top-category')).toBe(false)
  })

  it('stays quiet once the trip is over', () => {
    expect(run({ budget: 100_00, status: 'ended', bookings: [booking()] })).toEqual([])
  })
})
