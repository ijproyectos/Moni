import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { makeTransaction } from '@/features/transactions/domain/testing'
import { MovementSheetContext } from '@/features/transactions/ui/movementSheetContext'
import type { PersonalTrip } from '../domain/trip'
import { PersonalTripPage } from './PersonalTripPage'

const state = vi.hoisted(() => ({
  trips: { data: [], isLoading: false, isError: false, error: null } as Record<string, unknown>,
  expenses: { data: [], isLoading: false } as Record<string, unknown>,
  updateTrip: vi.fn(),
}))
const voidTx = vi.hoisted(() => vi.fn())
const plus = vi.hoisted(() => ({ isPlus: false }))
const extra = vi.hoisted(() => ({
  bookings: [] as unknown[],
  side: [] as unknown[],
  cancelBooking: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => ({ isPlus: plus.isPlus, isFree: !plus.isPlus, isLoading: false }) }))
vi.mock('@/features/ahorros/api/useAhorros', () => ({ useAhorros: () => ({ data: [] }) }))
vi.mock('../api/useArsPerUsd', () => ({ useArsPerUsd: () => null }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [{ id: 'acc', name: 'Banco' }] }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/transactions/api/useTransactions', () => ({
  useTransactions: () => ({ data: [] }),
  useVoidTransaction: () => ({ mutateAsync: voidTx, isPending: false }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('./TripIconPicker', () => ({ TripIconButton: () => <button type="button" aria-label="Cambiar el ícono del viaje" /> }))
vi.mock('../api/useTrips', () => ({
  useTrips: () => state.trips,
  useTripExpenses: () => state.expenses,
  useCreateTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTrip: () => ({ mutateAsync: state.updateTrip, isPending: false }),
  useSideExpenses: () => ({ data: extra.side }),
  useBookings: () => ({ data: extra.bookings }),
  useTripCategories: () => ({ data: [] }),
  useVoidSideExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelBooking: () => ({ mutateAsync: extra.cancelBooking, isPending: false }),
  useDeleteBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkMovementToBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddTripExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTripCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
      {
        id: 'food',
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        archivedAt: null,
      },
      {
        id: 'bus',
        kind: 'expense',
        name: 'Transporte',
        icon: 'BusFront',
        color: '#2F9E8F',
        archivedAt: null,
      },
    ],
  }),
}))

const trip: PersonalTrip = {
  id: 't1',
  name: 'Semana en Salta',
  startsOn: '2999-12-10',
  endsOn: '2999-12-17',
  budgetCents: 500_000_00,
  archivedAt: null,
}

function renderPage(id = 't1') {
  const openNew = vi.fn()
  const openEdit = vi.fn()
  render(
    <MemoryRouter initialEntries={[`/viajes/${id}`]}>
      <MovementSheetContext.Provider value={{ openNew, openEdit }}>
        <Routes>
          <Route path="/viajes/:id" element={<PersonalTripPage />} />
          <Route path="/viajes" element={<p>lista de viajes</p>} />
        </Routes>
      </MovementSheetContext.Provider>
    </MemoryRouter>,
  )
  return { openNew, openEdit, user: userEvent.setup() }
}

const expenses = [
  makeTransaction({
    id: 'a',
    tripId: 't1',
    categoryId: 'food',
    tripCategory: 'comidas',
    amountCents: 30_000_00,
    note: 'Cena',
    occurredOn: '2026-10-10',
  }),
  makeTransaction({
    id: 'b',
    tripId: 't1',
    categoryId: 'bus',
    tripCategory: 'transporte',
    amountCents: 60_000_00,
    note: null,
    occurredOn: '2026-10-11',
  }),
  makeTransaction({ id: 'z', tripId: 'other', categoryId: 'food', amountCents: 1_000_000_00 }),
]

beforeEach(() => {
  state.updateTrip.mockReset()
  state.trips = { data: [trip], isLoading: false, isError: false, error: null }
  state.expenses = { data: expenses, isLoading: false }
  extra.bookings = []
  extra.side = []
  plus.isPlus = false
})

describe('PersonalTripPage', () => {
  it('shows the budget against what was really spent, and what is left', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Semana en Salta' })).toBeVisible()
    const budget = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(budget).toHaveTextContent('$500.000')
    expect(budget).toHaveTextContent('Gastos registrados (pagado)$90.000')
    expect(budget).toHaveTextContent('18%')
    expect(budget).toHaveTextContent('Disponible del presupuesto$410.000')
  })

  it('breaks the spending down by category, biggest first, without counting other trips', () => {
    renderPage()
    const section = screen
      .getByRole('heading', { name: 'Gastos por categoría' })
      .closest('section') as HTMLElement
    const rows = within(section).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Transporte')
    expect(rows[0]).toHaveTextContent('Transporte')
    expect(rows[0]).toHaveTextContent('$60.000')
    expect(rows[0]).toHaveTextContent('67% de lo gastado')
    expect(rows[1]).toHaveTextContent('Comida')
    expect(rows[1]).toHaveTextContent('$30.000')
  })

  it('lists the trip movements; tapping one opens its summary, from where it is edited or deleted after confirming', async () => {
    const { openEdit, user } = renderPage()
    expect(screen.queryByText(/1\.000\.000/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ver detalle de Cena' }))
    const dialog = screen.getByRole('dialog', { name: 'Resumen del movimiento' })
    await user.click(within(dialog).getByRole('button', { name: 'Editar' }))
    expect(openEdit).toHaveBeenCalledWith(expenses[0])
  })

  it('has real buttons for what the swipe does, and deleting asks first', async () => {
    const { user } = renderPage()
    expect(screen.getByRole('button', { name: 'Editar Cena' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Eliminar Cena' }))
    expect(voidTx).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(voidTx).toHaveBeenCalledWith('a')
  })

  it('"Cargar gasto" opens the trip expense sheet (origin of the money, category, currency)', async () => {
    const { user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    const dialog = screen.getByRole('dialog', { name: 'Cargar gasto' })
    expect(within(dialog).getByRole('group', { name: 'Categoría del gasto' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Mis ahorros' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'De otro lado' })).toBeVisible()
  })

  it('says so when the budget is exceeded', () => {
    state.expenses = {
      data: [makeTransaction({ tripId: 't1', amountCents: 520_000_00 })],
      isLoading: false,
    }
    renderPage()
    expect(screen.getByText('Te pasaste del presupuesto')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Presupuesto del viaje' })).toHaveTextContent('$20.000')
  })

  it('a trip without expenses says so (nothing is made up)', () => {
    state.expenses = { data: [], isLoading: false }
    renderPage()
    expect(screen.getByText('Todavía no cargaste gastos de este viaje.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Gastos por categoría' })).toBeNull()
  })

  it('an unknown trip says it was not found and its back button goes to Viajes (nothing before it)', async () => {
    const { user } = renderPage('nope')
    expect(screen.getByText('No encontramos este viaje')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByText('lista de viajes')).toBeVisible()
  })

  it('Editar opens the trip with its destination, dates and budget, and saves the changes', async () => {
    state.updateTrip.mockResolvedValue({ ...trip, name: 'Salta y Jujuy' })
    const { user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar viaje' })
    expect(within(dialog).getByLabelText('Nombre del viaje')).toHaveValue('Semana en Salta')
    expect(within(dialog).getByLabelText('Presupuesto')).toHaveValue('500.000')
    expect(within(dialog).getByRole('button', { name: 'Fecha de ida' })).toHaveTextContent(
      '10 de dic',
    )
    expect(within(dialog).getByRole('button', { name: 'Fecha de vuelta' })).toHaveTextContent(
      '17 de dic',
    )

    const name = within(dialog).getByLabelText('Nombre del viaje')
    await user.clear(name)
    await user.type(name, 'Salta y Jujuy')
    const budget = within(dialog).getByLabelText('Presupuesto')
    await user.clear(budget)
    await user.type(budget, '700000')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

    expect(state.updateTrip).toHaveBeenCalledTimes(1)
    expect(state.updateTrip.mock.calls[0]?.[0]).toEqual({
      id: 't1',
      values: {
        name: 'Salta y Jujuy',
        startsOn: '2999-12-10',
        endsOn: '2999-12-17',
        budgetCents: 700_000_00,
        destination: '',
        currency: 'ARS',
        funding: null,
      },
    })
    expect(screen.queryByRole('dialog', { name: 'Editar viaje' })).toBeNull()
  })

  it('editing validates like creating and saves nothing when something is missing', async () => {
    const { user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Nombre del viaje'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Contanos a dónde vas.')
    expect(state.updateTrip).not.toHaveBeenCalled()
  })

  it('a trip that already ended stays reachable with its whole history', () => {
    state.trips = {
      data: [{ ...trip, startsOn: '2020-01-02', endsOn: '2020-01-09' }],
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPage()
    expect(screen.getByText('Cena')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Presupuesto del viaje' })).toHaveTextContent(
      '$90.000',
    )
    // Nothing to suggest per day once the trip is over.
    expect(screen.queryByText(/por día/)).toBeNull()
  })

  it('without a budget it shows what was spent and committed, and no invented "available" or percentage', () => {
    state.trips = { data: [{ ...trip, budgetCents: 0 }], isLoading: false, isError: false, error: null }
    renderPage()
    const card = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(card).toHaveTextContent('Gastado y comprometido')
    expect(card).toHaveTextContent('$90.000')
    expect(card).not.toHaveTextContent('Disponible')
    expect(card).not.toHaveTextContent('%')
    expect(screen.getByRole('button', { name: 'Agregar un presupuesto' })).toBeVisible()
  })

  it('a booking and its payments count once: pending is total minus what was paid, and the budget leaves room for it', () => {
    extra.bookings = [
      {
        id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'airbnb', title: 'Casa Salta',
        origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 200_000_00, currency: 'ARS',
        payDeadline: null, notes: null, status: 'active', participants: [],
      },
    ]
    state.expenses = {
      data: [makeTransaction({ id: 'p', tripId: 't1', bookingId: 'b1', tripCategory: 'alojamiento', amountCents: 50_000_00, note: 'Seña', categoryId: 'food' })],
      isLoading: false,
    }
    renderPage()
    const card = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(card).toHaveTextContent('Gastos registrados (pagado)$50.000')
    expect(card).toHaveTextContent('Reservas pendientes de pago$150.000')
    // 500.000 - 50.000 paid - 150.000 still owed: the payment is NOT counted again on top of the booking.
    expect(card).toHaveTextContent('Disponible del presupuesto$300.000')
    const bookings = screen.getByRole('region', { name: 'Mis reservas' })
    expect(bookings).toHaveTextContent('Casa Salta')
    expect(bookings).toHaveTextContent('Pagado$50.000')
    expect(bookings).toHaveTextContent('Pendiente$150.000')
  })

  it('a trip does not need bookings: the section is there but empty', () => {
    renderPage()
    expect(screen.getByRole('region', { name: 'Mis reservas' })).toHaveTextContent('es opcional')
  })

  it('Moni recommendations are for Plus only, and say nothing without information', () => {
    extra.bookings = [
      {
        id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'hotel', title: 'Hotel Sol',
        origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 200_000_00, currency: 'ARS',
        payDeadline: null, notes: null, status: 'active', participants: [],
      },
    ]
    plus.isPlus = false
    const free = renderPage()
    void free
    expect(screen.queryByRole('region', { name: 'Moni te cuenta' })).toBeNull()
  })

  it('a Plus person gets the reading of their trip', () => {
    extra.bookings = [
      {
        id: 'b1', ownerId: 'u1', tripId: 't1', groupId: null, scope: 'personal', kind: 'lodging', subtype: 'hotel', title: 'Hotel Sol',
        origin: null, destination: null, address: null, startsOn: null, endsOn: null, totalCents: 200_000_00, currency: 'ARS',
        payDeadline: null, notes: null, status: 'active', participants: [],
      },
    ]
    plus.isPlus = true
    renderPage()
    const card = screen.getByRole('region', { name: 'Moni te cuenta' })
    expect(card).toHaveTextContent('Después de cubrir tus reservas, te quedan $210.000 de presupuesto para disfrutar el viaje.')
  })
})
