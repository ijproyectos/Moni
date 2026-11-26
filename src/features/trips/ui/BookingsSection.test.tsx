import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TripBooking } from '../domain/bookings'
import { bookingStates } from '../domain/tripFinance'
import { BookingsSection } from './BookingsSection'

const booking = (over: Partial<TripBooking> = {}): TripBooking => ({
  id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'airbnb', title: 'Casa Floripa',
  origin: null, destination: null, address: 'Rua 1', startsOn: '2026-12-10', endsOn: '2026-12-15', totalCents: 700_00, currency: 'USD',
  payDeadline: '2999-01-01', notes: null, status: 'active', participants: [], ...over,
})
const paid = (cents: number) => ({ id: 'p', source: 'movement' as const, occurredOn: '2026-11-01', title: '', categoryKey: null, bookingId: 'b1', funding: 'balance' as const, ars: null, usd: cents })

function setup(b = booking(), items = [paid(200_00)], actions: Record<string, unknown> = {}) {
  const calls = { pay: vi.fn(), edit: vi.fn(), setCancelled: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), link: vi.fn(), ...actions }
  render(<BookingsSection states={bookingStates([b], items, 1200)} onAdd={vi.fn()} actions={calls as never} />)
  return { calls, user: userEvent.setup() }
}

describe('BookingsSection', () => {
  it('shows total, paid and pending (USD 700, a deposit of USD 200 → USD 500 pending) and the nights', () => {
    setup()
    const region = screen.getByRole('region', { name: 'Mis reservas' })
    expect(region).toHaveTextContent('TotalUS$ 700')
    expect(region).toHaveTextContent('PagadoUS$ 200')
    expect(region).toHaveTextContent('PendienteUS$ 500')
    expect(region).toHaveTextContent('5 noches')
  })

  it('"Registrar un pago" hands the booking over; a fully paid one has no pay button', async () => {
    const { calls, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Registrar un pago de Casa Floripa' }))
    expect(calls.pay).toHaveBeenCalledTimes(1)
  })

  it('a fully paid booking says so', () => {
    setup(booking(), [paid(700_00)])
    expect(screen.getByText('Pagada')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Registrar un pago/ })).toBeNull()
  })

  it('cancelling asks first and says what stays; deleting asks first too', async () => {
    const { calls, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Más opciones de Casa Floripa' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    expect(calls.setCancelled).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Lo que ya pagaste sigue siendo un gasto del viaje')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }))
    expect(calls.setCancelled).toHaveBeenCalledWith(expect.objectContaining({ booking: expect.objectContaining({ id: 'b1' }) }), true)
  })

  it('a cancelled booking owes nothing and can be reactivated', async () => {
    const { user } = setup(booking({ status: 'cancelled' }))
    expect(screen.getByText('Cancelada')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Mis reservas' })).toHaveTextContent('PendienteUS$ 0')
    await user.click(screen.getByRole('button', { name: 'Más opciones de Casa Floripa' }))
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeVisible()
  })

  it('an expired or near deadline is flagged only while something is pending', () => {
    setup(booking({ payDeadline: '2000-01-01' }))
    expect(screen.getByText(/Venció el/)).toBeVisible()
  })

  it('is empty and optional by default', () => {
    render(<BookingsSection states={[]} onAdd={vi.fn()} actions={{ edit: vi.fn(), setCancelled: vi.fn(), remove: vi.fn() }} />)
    expect(screen.getByRole('region', { name: 'Mis reservas' })).toHaveTextContent('es opcional')
  })
})
