import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TripBooking } from '../domain/bookings'
import { TripExpenseSheet } from './TripExpenseSheet'

const add = vi.hoisted(() => vi.fn())
const rate = vi.hoisted(() => ({ value: null as number | null }))
vi.mock('../api/useTrips', () => ({
  useAddTripExpense: () => ({ mutateAsync: add, isPending: false }),
  useTripCategories: () => ({ data: [] }),
  useCreateTripCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../api/useArsPerUsd', () => ({ useArsPerUsd: () => rate.value }))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Banco', kind: 'bank' },
      { id: 'a2', name: 'Visa', kind: 'credit_card' },
    ],
  }),
}))
vi.mock('@/features/ahorros/api/useAhorros', () => ({
  useAhorros: () => ({
    data: [{ id: 'e1', currency: 'ARS', kind: 'deposit', amountCents: 100_000_00, accountId: 'a1', status: 'posted', occurredOn: '2026-11-01', note: null, createdAt: '' }],
  }),
}))

const booking: TripBooking = {
  id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'hotel', title: 'Hotel Sol',
  origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 700_00, currency: 'USD', payDeadline: null,
  notes: null, status: 'active', participants: [],
}

beforeEach(() => {
  add.mockReset().mockResolvedValue({ transactionId: 'x', sideExpenseId: null })
  rate.value = null
})

function setup(props: Partial<React.ComponentProps<typeof TripExpenseSheet>> = {}) {
  const onClose = vi.fn()
  render(<TripExpenseSheet trip={{ id: 't1', currency: 'ARS', funding: { source: 'balance', accountId: 'a1', ahorroCurrency: null } }} onClose={onClose} {...props} />)
  return { onClose, user: userEvent.setup() }
}

describe('TripExpenseSheet', () => {
  it('starts with the trip\'s default origin of the money and the origin can be changed in this expense', async () => {
    const { user, onClose } = setup()
    expect(screen.getByLabelText('Medio de pago')).toHaveValue('a1')
    await user.type(screen.getByLabelText('Importe'), '15000')
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]?.[0]).toMatchObject({ tripId: 't1', amountCents: 15_000_00, currency: 'ARS', funding: { source: 'balance', accountId: 'a1' } })
    expect(onClose).toHaveBeenCalled()

    add.mockClear()
    const second = setup()
    await second.user.click(screen.getAllByRole('button', { name: 'De otro lado' })[1] as HTMLElement)
    await second.user.type(screen.getAllByLabelText('Importe')[1] as HTMLElement, '500')
    await second.user.click(screen.getAllByRole('button', { name: 'Cargar gasto' }).at(-1) as HTMLElement)
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]?.[0].funding).toEqual({ source: 'external', accountId: null, ahorroCurrency: null })
  })

  it('savings offer the accounts where something is reserved and send the savings currency', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Mis ahorros' }))
    const select = screen.getByLabelText('Cuenta donde están tus ahorros')
    expect(select).toHaveValue('a1')
    await user.type(screen.getByLabelText('Importe'), '2000')
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]?.[0].funding).toEqual({ source: 'savings', accountId: 'a1', ahorroCurrency: 'ARS' })
  })

  it('a dollar amount that touches my accounts needs the rate; with it, it is sent', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Dólares' }))
    await user.type(screen.getByLabelText('Importe'), '100')
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Poné la cotización del dólar')
    expect(add).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Cotización del dólar'), '1200')
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]?.[0]).toMatchObject({ currency: 'USD', amountCents: 100_00, fxRate: 1200 })
  })

  it('a payment of a booking starts with what is pending and points at the booking (never a second expense)', async () => {
    const { user } = setup({ payment: { booking, pendingCents: 500_00 } })
    expect(screen.getByRole('dialog', { name: 'Registrar un pago' })).toBeVisible()
    expect(screen.getByText(/pendiente US\$ 500/)).toBeVisible()
    expect(screen.getByLabelText('Importe')).toHaveValue('500')
    await user.click(screen.getByRole('button', { name: 'De otro lado' }))
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]?.[0]).toMatchObject({ bookingId: 'b1', currency: 'USD', amountCents: 500_00, categoryKey: 'alojamiento' })
  })

  it('shows the server\'s reason and does not close when it refuses', async () => {
    add.mockRejectedValueOnce(new Error('not_enough_savings'))
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Importe'), '100')
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
  })
})
