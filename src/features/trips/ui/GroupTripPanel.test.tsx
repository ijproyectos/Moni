import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TripBooking } from '../domain/bookings'
import { GroupTripPanel } from './GroupTripPanel'

const data = vi.hoisted(() => ({ bookings: [] as unknown[], paid: new Map<string, number>(), funding: null as unknown }))
vi.mock('../api/useArsPerUsd', () => ({ useArsPerUsd: () => null }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Banco', kind: 'bank' }] }) }))
vi.mock('@/features/ahorros/api/useAhorros', () => ({ useAhorros: () => ({ data: [] }) }))
vi.mock('@/features/transactions/api/useTransactions', () => ({ useTransactions: () => ({ data: [] }) }))
vi.mock('../api/useTrips', () => ({
  useBookings: () => ({ data: data.bookings }),
  useGroupBookingPaid: () => ({ data: data.paid }),
  useBookingMovements: () => ({ data: [] }),
  useSideExpenses: () => ({ data: [] }),
  useMyGroupFunding: () => ({ data: data.funding }),
  useSetMyGroupFunding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkMovementToBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddTripExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTripCategories: () => ({ data: [] }),
  useCreateTripCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const booking = (over: Partial<TripBooking>): TripBooking => ({
  id: 'x', ownerId: 'me', tripId: null, groupId: 'g1', scope: 'shared', kind: 'lodging', subtype: 'hotel', title: 'Cabaña',
  origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 300_000_00, currency: 'ARS', payDeadline: null,
  notes: null, status: 'active', participants: ['me', 'b'], ...over,
})

const props = {
  groupId: 'g1',
  trip: { groupId: 'g1', startsOn: '2999-12-10', endsOn: '2999-12-20', budgetCents: 1_000_000_00, currency: 'ARS' as const },
  ledger: { totalCents: 400_000_00, myShareCents: 200_000_00, myNetCents: -50_000_00, paid: { me: 150_000_00 } },
  meId: 'me',
  members: [{ userId: 'me', name: 'Iara' }, { userId: 'b', name: 'Beto' }],
  isAdmin: true,
  today: '2999-12-01',
  onPayShared: vi.fn(),
}

beforeEach(() => {
  data.bookings = []
  data.paid = new Map()
  data.funding = null
})

describe('GroupTripPanel', () => {
  it('tells apart the trip total, my part, what I paid and what I owe', () => {
    render(<GroupTripPanel {...props} />)
    const mine = screen.getByRole('region', { name: 'Mi parte del viaje' })
    expect(mine).toHaveTextContent('Gastos totales del viaje$400.000')
    expect(mine).toHaveTextContent('Mi parte de los gastos$200.000')
    expect(mine).toHaveTextContent('Lo que pagué$150.000')
    expect(mine).toHaveTextContent('Lo que debo$50.000')
  })

  it('owed to me reads as "lo que me deben"', () => {
    render(<GroupTripPanel {...props} ledger={{ ...props.ledger, myNetCents: 70_000_00 }} />)
    expect(screen.getByRole('region', { name: 'Mi parte del viaje' })).toHaveTextContent('Lo que me deben$70.000')
  })

  it('the shared budget counts shared bookings once (paid is already in the group total); my personal ones never show in it', () => {
    data.bookings = [
      booking({ id: 's1' }),
      booking({ id: 'p1', scope: 'personal', title: 'Pasaje mío', totalCents: 90_000_00, participants: [] }),
    ]
    data.paid = new Map([['s1', 100_000_00]])
    render(<GroupTripPanel {...props} />)
    const budget = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(budget).toHaveTextContent('Presupuesto total$1.000.000')
    expect(budget).toHaveTextContent('Gastos registrados (pagado)$400.000')
    // Only the shared booking's pending part (300.000 - 100.000) is committed: 1.000.000 - 400.000 - 200.000.
    expect(budget).toHaveTextContent('Reservas pendientes de pago$200.000')
    expect(budget).toHaveTextContent('Disponible del presupuesto$400.000')
    expect(screen.getByRole('region', { name: 'Mi parte del viaje' })).toHaveTextContent('Mi parte de reservas pendientes$100.000')
    expect(screen.getByRole('region', { name: 'Mi parte del viaje' })).toHaveTextContent('Mis reservas personales pendientes$90.000')
  })

  it('paying a shared booking hands it to the shared-expense form (division, debts and settlements stay as always)', async () => {
    data.bookings = [booking({ id: 's1' })]
    const onPayShared = vi.fn()
    render(<GroupTripPanel {...props} onPayShared={onPayShared} />)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar un pago de Cabaña' }))
    expect(onPayShared).toHaveBeenCalledWith(expect.objectContaining({ booking: expect.objectContaining({ id: 's1' }) }))
  })

  it('my origin of the money is mine alone, and it is set from here', async () => {
    data.funding = { source: 'external', accountId: null, ahorroCurrency: null }
    const user = userEvent.setup()
    render(<GroupTripPanel {...props} />)
    const button = screen.getByRole('button', { name: /Mi origen de la plata: De otro lado/ })
    await user.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Mi origen de la plata' })
    expect(within(dialog).getByText(/nadie más del viaje ve tus ahorros, saldos ni medios de pago/)).toBeVisible()
  })

  it('without a budget it only shows what was spent and what is committed', () => {
    render(<GroupTripPanel {...props} trip={{ ...props.trip, budgetCents: 0 }} />)
    const budget = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(budget).toHaveTextContent('Gastado y comprometido')
    expect(budget).not.toHaveTextContent('Disponible')
  })
})
