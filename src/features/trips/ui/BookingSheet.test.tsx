import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingSheet } from './BookingSheet'

const create = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
vi.mock('../api/useTrips', () => ({
  useCreateBooking: () => ({ mutateAsync: create, isPending: false }),
  useUpdateBooking: () => ({ mutateAsync: update, isPending: false }),
}))

beforeEach(() => {
  create.mockReset().mockResolvedValue('b1')
  update.mockReset().mockResolvedValue(undefined)
})

describe('BookingSheet', () => {
  it('only the name and the total are required: everything else is optional', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BookingSheet target={{ tripId: 't1' }} defaultCurrency="USD" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Guardar reserva' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ponele un nombre')
    await user.type(screen.getByLabelText('Aerolínea o empresa'), 'Flybondi')
    await user.click(screen.getByRole('button', { name: 'Guardar reserva' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Poné el costo total')
    await user.type(screen.getByLabelText('Costo total'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar reserva' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      target: { tripId: 't1' },
      values: { kind: 'transport', title: 'Flybondi', totalCents: 450_00, currency: 'USD', startsOn: null, endsOn: null, scope: 'personal', participants: [] },
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('a stay shows its nights, calculated from check-in and check-out', async () => {
    const user = userEvent.setup()
    render(<BookingSheet target={{ tripId: 't1' }} defaultCurrency="ARS" onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Alojamiento' }))
    await user.type(screen.getByLabelText('Check-in'), '2026-12-10')
    await user.type(screen.getByLabelText('Check-out'), '2026-12-15')
    expect(screen.getByText('5 noches')).toBeVisible()
    expect(screen.getByLabelText('Dirección')).toBeVisible()
    expect(screen.getByLabelText('Fecha límite de pago')).toBeVisible()
  })

  it('a return before the departure is refused', async () => {
    const user = userEvent.setup()
    render(<BookingSheet target={{ tripId: 't1' }} defaultCurrency="ARS" onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Aerolínea o empresa'), 'Bus')
    await user.type(screen.getByLabelText('Costo total'), '100')
    await user.type(screen.getByLabelText('Ida'), '2026-12-10')
    await user.type(screen.getByLabelText('Vuelta'), '2026-12-05')
    await user.click(screen.getByRole('button', { name: 'Guardar reserva' }))
    expect(screen.getByRole('alert')).toHaveTextContent('no puede ser antes')
    expect(create).not.toHaveBeenCalled()
  })

  it('in a shared trip it can be only for me, or shared with the members who take part', async () => {
    const user = userEvent.setup()
    const members = [
      { userId: 'me', name: 'Iara' },
      { userId: 'b', name: 'Beto' },
    ]
    render(<BookingSheet target={{ groupId: 'g1' }} defaultCurrency="ARS" members={members} meId="me" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Solo para mí' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Compartida' }))
    expect(screen.getByRole('group', { name: 'Quiénes participan' })).toBeVisible()
    expect(screen.getByText(/nunca tus ahorros, saldos ni medios de pago/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Beto' }))
    await user.click(screen.getByRole('button', { name: 'Otra' }))
    await user.type(screen.getByLabelText('Reserva'), 'Cabaña')
    await user.type(screen.getByLabelText('Costo total'), '300000')
    await user.click(screen.getByRole('button', { name: 'Guardar reserva' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]?.[0]).toMatchObject({ target: { groupId: 'g1' }, values: { scope: 'shared', participants: ['me', 'b'] } })
  })

  it('in a personal trip there is no sharing option: every booking is personal', () => {
    render(<BookingSheet target={{ tripId: 't1' }} defaultCurrency="ARS" onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Compartida' })).toBeNull()
  })
})
