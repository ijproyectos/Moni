import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { makeTransaction } from '@/features/transactions/domain/testing'
import type { GroupTripInfo, PersonalTrip } from '../domain/trip'
import { TripsPage } from './TripsPage'

const state = vi.hoisted(() => ({
  trips: { data: [], isLoading: false, isError: false, error: null } as Record<string, unknown>,
  expenses: { data: [] } as Record<string, unknown>,
  groupTrips: { data: [] as GroupTripInfo[] },
  groups: { data: [] as unknown[], isLoading: false },
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  setGroupTrip: vi.fn(),
  createGroup: vi.fn(),
}))

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/useTrips', () => ({
  useTrips: () => state.trips,
  useTripExpenses: () => state.expenses,
  useGroupTrips: () => state.groupTrips,
  useCreateTrip: () => ({ mutateAsync: state.createTrip, isPending: false }),
  useUpdateTrip: () => ({ mutateAsync: state.updateTrip, isPending: false }),
  useSetGroupTrip: () => ({ mutateAsync: state.setGroupTrip, isPending: false }),
}))
vi.mock('@/features/groups/api/useGroups', () => ({
  useMyGroups: () => state.groups,
  useCreateGroup: () => ({ mutateAsync: state.createGroup, isPending: false }),
}))

const trip = (over: Partial<PersonalTrip> = {}): PersonalTrip => ({
  id: 't1',
  name: 'Semana en Salta',
  startsOn: '2999-12-10',
  endsOn: '2999-12-17',
  budgetCents: 500_000_00,
  archivedAt: null,
  ...over,
})
const group = (id: string, name: string, kind = 'viaje', role = 'owner') => ({
  id,
  name,
  kind,
  role,
  memberCount: 3,
  myNetCents: 0,
  lastActivity: '2026-10-01T00:00:00Z',
})

function renderPage(url = '/viajes') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/viajes" element={<TripsPage />} />
        <Route path="/viajes/:id" element={<p>detalle del viaje</p>} />
        <Route path="/grupos/:id" element={<p>detalle del grupo</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.trips = { data: [], isLoading: false, isError: false, error: null }
  state.expenses = { data: [] }
  state.groupTrips = { data: [] }
  state.groups = { data: [], isLoading: false }
  state.createTrip.mockReset()
  state.setGroupTrip.mockReset()
  state.createGroup.mockReset()
})

describe('Viajes: tabs and lists', () => {
  it('has the new subtitle and the two tabs, Mis viajes first', () => {
    renderPage()
    expect(screen.getByText('Organizá tus viajes y llevá tus gastos al día')).toBeVisible()
    const tabs = within(screen.getByRole('group', { name: 'Tipo de viajes' })).getAllByRole(
      'button',
    )
    expect(tabs.map((t) => t.textContent)).toEqual(['Mis viajes', 'En grupo'])
    expect(tabs[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('Mis viajes: an invitation to create the first one when there is none', () => {
    renderPage()
    expect(screen.getByText('Todavía no tenés viajes')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Crear viaje personal' })).toBeVisible()
  })

  it('Mis viajes: shows each trip with what was REALLY spent from its movements', () => {
    state.trips = { data: [trip()], isLoading: false, isError: false, error: null }
    state.expenses = {
      data: [
        makeTransaction({ id: 'a', tripId: 't1', amountCents: 120_000_00 }),
        makeTransaction({ id: 'b', tripId: 't1', amountCents: 30_000_00 }),
        makeTransaction({ id: 'c', tripId: 'other', amountCents: 999_00 }),
      ],
    }
    renderPage()
    const card = screen.getByRole('link', { name: /Semana en Salta/ })
    expect(card).toHaveAttribute('href', '/viajes/t1')
    expect(card).toHaveTextContent('Gastaste $150.000')
    expect(card).toHaveTextContent('Presupuesto $500.000')
    expect(card).toHaveTextContent('Personal')
  })

  it('a trip that went over budget says by how much', () => {
    state.trips = { data: [trip()], isLoading: false, isError: false, error: null }
    state.expenses = { data: [makeTransaction({ tripId: 't1', amountCents: 520_000_00 })] }
    renderPage()
    expect(screen.getByText('Te pasaste $20.000 del presupuesto')).toBeVisible()
  })

  it('trips that already ended go under Pasados', () => {
    state.trips = {
      data: [
        trip(),
        trip({ id: 't2', name: 'Mar del Plata', startsOn: '2020-01-02', endsOn: '2020-01-09' }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    }
    renderPage()
    expect(screen.getByRole('heading', { name: 'Pasados' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Mar del Plata/ })).toHaveTextContent('Terminó')
  })

  it('explains it plainly when the trips tables are not there yet (and breaks nothing)', () => {
    state.trips = { data: undefined, isLoading: false, isError: true, error: { code: 'PGRST205' } }
    renderPage()
    expect(screen.getByText('Estamos preparando tus viajes')).toBeVisible()
  })

  it('En grupo: keeps the existing group trips, with the real dates and budget when the group has them', async () => {
    state.groups = {
      data: [group('g1', 'Viaje a Brasil'), group('g2', 'Casa', 'casa')],
      isLoading: false,
    }
    state.groupTrips = {
      data: [
        { groupId: 'g1', startsOn: '2999-12-20', endsOn: '2999-12-30', budgetCents: 900_000_00 },
      ],
    }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'En grupo' }))
    const card = screen.getByRole('link', { name: /Viaje a Brasil/ })
    expect(card).toHaveAttribute('href', '/grupos/g1')
    expect(card).toHaveTextContent('20 al 30 de dic')
    expect(card).toHaveTextContent('Presupuesto $900.000')
    // A group that is not a trip stays out.
    expect(screen.queryByRole('link', { name: /Casa/ })).toBeNull()
  })

  it('En grupo: a group of another kind that got trip dates is a trip too', async () => {
    state.groups = { data: [group('g2', 'Amigos', 'amigos')], isLoading: false }
    state.groupTrips = {
      data: [
        { groupId: 'g2', startsOn: '2999-12-20', endsOn: '2999-12-30', budgetCents: 100_000_00 },
      ],
    }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'En grupo' }))
    expect(screen.getByRole('link', { name: /Amigos/ })).toBeVisible()
  })

  it('En grupo: invites to create one when there is none', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'En grupo' }))
    expect(screen.getByText('Todavía no tenés viajes en grupo')).toBeVisible()
  })
})

describe('Viajes: nuevo viaje', () => {
  it('the + asks which kind: Viaje personal or Viaje en grupo', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    const dialog = screen.getByRole('dialog', { name: 'Nuevo viaje' })
    expect(within(dialog).getByRole('button', { name: /Viaje personal/ })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: /Viaje en grupo/ })).toBeVisible()
  })

  it('personal: asks for destination, dates and budget, with no guests or invitations', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    await user.click(screen.getByRole('button', { name: /Viaje personal/ }))
    expect(screen.getByLabelText('Destino')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Fecha de ida' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Fecha de vuelta' })).toBeVisible()
    expect(screen.getByLabelText('Presupuesto')).toBeVisible()
    expect(screen.queryByText('Quiénes van')).toBeNull()
    expect(screen.queryByText(/Invitar/)).toBeNull()
  })

  it('personal: validates and then creates the trip and opens it', async () => {
    state.createTrip.mockResolvedValue({ id: 'new-trip' })
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    await user.click(screen.getByRole('button', { name: /Viaje personal/ }))
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Contanos a dónde vas.')
    await user.type(screen.getByLabelText('Destino'), 'Salta')
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Poné un presupuesto.')
    expect(state.createTrip).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Presupuesto'), '500000')
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    await waitFor(() => expect(state.createTrip).toHaveBeenCalledTimes(1))
    expect(state.createTrip.mock.calls[0]?.[0]).toMatchObject({
      name: 'Salta',
      budgetCents: 500_000_00,
    })
    expect(await screen.findByText('detalle del viaje')).toBeVisible()
  })

  it('group: can use a group that already exists (nothing is duplicated)', async () => {
    state.groups = { data: [group('g2', 'Amigos', 'amigos')], isLoading: false }
    state.setGroupTrip.mockResolvedValue(undefined)
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    await user.click(screen.getByRole('button', { name: /Viaje en grupo/ }))
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí el grupo del viaje.')
    await user.click(screen.getByRole('button', { name: /Amigos/ }))
    await user.type(screen.getByLabelText('Presupuesto'), '900000')
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    await waitFor(() => expect(state.setGroupTrip).toHaveBeenCalledTimes(1))
    expect(state.createGroup).not.toHaveBeenCalled()
    expect(state.setGroupTrip.mock.calls[0]?.[0]).toMatchObject({
      groupId: 'g2',
      values: { budgetCents: 900_000_00 },
    })
    expect(await screen.findByText('detalle del grupo')).toBeVisible()
  })

  it('group: a group that already has trip dates is not offered again', async () => {
    state.groups = {
      data: [group('g1', 'Viaje a Brasil'), group('g2', 'Amigos', 'amigos')],
      isLoading: false,
    }
    state.groupTrips = {
      data: [{ groupId: 'g1', startsOn: '2999-12-20', endsOn: '2999-12-30', budgetCents: 1 }],
    }
    const user = renderPage('/viajes?nuevo=grupo')
    const list = screen.getByRole('group', { name: 'Tus grupos' })
    expect(within(list).getByRole('button', { name: /Amigos/ })).toBeVisible()
    expect(within(list).queryByRole('button', { name: /Brasil/ })).toBeNull()
    void user
  })

  it('group: only groups the person created are offered (only the creator can set the trip)', () => {
    state.groups = {
      data: [
        group('g1', 'Mis amigos', 'amigos', 'owner'),
        group('g3', 'Del trabajo', 'amigos', 'member'),
      ],
      isLoading: false,
    }
    renderPage('/viajes?nuevo=grupo')
    const list = screen.getByRole('group', { name: 'Tus grupos' })
    expect(within(list).getByRole('button', { name: /Mis amigos/ })).toBeVisible()
    expect(within(list).queryByRole('button', { name: /Del trabajo/ })).toBeNull()
    expect(
      screen.getByText('Solo quien creó el grupo puede definir sus fechas y su presupuesto.'),
    ).toBeVisible()
  })

  it('group: when the person owns no group, the only way is a new one', () => {
    state.groups = { data: [group('g3', 'Del trabajo', 'amigos', 'member')], isLoading: false }
    renderPage('/viajes?nuevo=grupo')
    expect(screen.queryByRole('group', { name: 'Tus grupos' })).toBeNull()
    expect(screen.getByLabelText('Nombre del viaje')).toBeVisible()
  })

  it('group: with no group to use, it creates a new one with the real group flow', async () => {
    state.createGroup.mockResolvedValue('new-group')
    state.setGroupTrip.mockResolvedValue(undefined)
    const user = renderPage('/viajes?nuevo=grupo')
    await user.type(screen.getByLabelText('Nombre del viaje'), 'Viaje a Brasil')
    await user.type(screen.getByLabelText('Presupuesto'), '900000')
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    await waitFor(() =>
      expect(state.createGroup).toHaveBeenCalledWith({ name: 'Viaje a Brasil', kind: 'viaje' }),
    )
    expect(state.setGroupTrip.mock.calls[0]?.[0]).toMatchObject({ groupId: 'new-group' })
    expect(await screen.findByText('detalle del grupo')).toBeVisible()
    // Invitations stay in Grupos: no guests or codes here.
    expect(screen.queryByText('Quiénes van')).toBeNull()
  })
})
