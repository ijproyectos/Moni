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
vi.mock('../api/useTrips', () => ({
  useTrips: () => state.trips,
  useTripExpenses: () => state.expenses,
  useCreateTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTrip: () => ({ mutateAsync: state.updateTrip, isPending: false }),
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
    amountCents: 30_000_00,
    note: 'Cena',
    occurredOn: '2026-10-10',
  }),
  makeTransaction({
    id: 'b',
    tripId: 't1',
    categoryId: 'bus',
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
})

describe('PersonalTripPage', () => {
  it('shows the budget against what was really spent, and what is left', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Semana en Salta' })).toBeVisible()
    const budget = screen.getByRole('region', { name: 'Presupuesto del viaje' })
    expect(budget).toHaveTextContent('$500.000')
    expect(budget).toHaveTextContent('Gastaste $90.000')
    expect(budget).toHaveTextContent('18%')
    expect(budget).toHaveTextContent('Te quedan $410.000')
  })

  it('breaks the spending down by category, biggest first, without counting other trips', () => {
    renderPage()
    const section = screen
      .getByRole('heading', { name: 'En qué gastaste' })
      .closest('section') as HTMLElement
    const rows = within(section).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Transporte')
    expect(rows[0]).toHaveTextContent('$60.000')
    expect(rows[0]).toHaveTextContent('67% de lo gastado')
    expect(rows[1]).toHaveTextContent('Comida')
    expect(rows[1]).toHaveTextContent('$30.000')
  })

  it('lists the trip movements; tapping one edits it with the usual movement sheet', async () => {
    const { openEdit, user } = renderPage()
    expect(screen.queryByText(/1\.000\.000/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Editar gasto Cena' }))
    expect(openEdit).toHaveBeenCalledWith(expenses[0])
  })

  it('"Cargar gasto" opens the usual new-expense sheet bound to this trip', async () => {
    const { openNew, user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Cargar gasto' }))
    expect(openNew).toHaveBeenCalledWith('expense', { tripId: 't1' })
  })

  it('says so when the budget is exceeded', () => {
    state.expenses = {
      data: [makeTransaction({ tripId: 't1', amountCents: 520_000_00 })],
      isLoading: false,
    }
    renderPage()
    expect(screen.getByText('Te pasaste $20.000')).toBeVisible()
  })

  it('a trip without expenses says so (nothing is made up)', () => {
    state.expenses = { data: [], isLoading: false }
    renderPage()
    expect(screen.getByText('Todavía no cargaste gastos de este viaje.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'En qué gastaste' })).toBeNull()
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
    expect(within(dialog).getByLabelText('Destino')).toHaveValue('Semana en Salta')
    expect(within(dialog).getByLabelText('Presupuesto')).toHaveValue('500.000')
    expect(within(dialog).getByRole('button', { name: 'Fecha de ida' })).toHaveTextContent(
      '10 de dic',
    )
    expect(within(dialog).getByRole('button', { name: 'Fecha de vuelta' })).toHaveTextContent(
      '17 de dic',
    )

    const name = within(dialog).getByLabelText('Destino')
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
      },
    })
    expect(screen.queryByRole('dialog', { name: 'Editar viaje' })).toBeNull()
  })

  it('editing validates like creating and saves nothing when something is missing', async () => {
    const { user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Destino'))
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
      'Gastaste $90.000',
    )
    // Nothing to suggest per day once the trip is over.
    expect(screen.queryByText(/por día/)).toBeNull()
  })
})
