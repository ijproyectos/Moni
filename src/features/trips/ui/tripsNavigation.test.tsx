import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
  useLocation,
  type RouteObject,
} from 'react-router'
import { MovementSheetContext } from '@/features/transactions/ui/movementSheetContext'
import { useGoBack } from '@/shared/lib/useGoBack'
import type { PersonalTrip } from '../domain/trip'
import { PageHeader } from '@/shared/ui/PageHeader'
import { PersonalTripPage } from './PersonalTripPage'
import { TripsPage } from './TripsPage'

const state = vi.hoisted(() => ({
  trips: [] as unknown[],
  createTrip: vi.fn(),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/useTrips', () => ({
  useTrips: () => ({ data: state.trips, isLoading: false, isError: false, error: null }),
  useTripExpenses: () => ({ data: [], isLoading: false }),
  useGroupTrips: () => ({ data: [] }),
  useCreateTrip: () => ({ mutateAsync: state.createTrip, isPending: false }),
  useUpdateTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetGroupTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/groups/api/useGroups', () => ({
  useMyGroups: () => ({
    data: [
      {
        id: 'g1',
        name: 'Mar del Plata',
        kind: 'viaje',
        role: 'owner',
        memberCount: 3,
        myNetCents: 0,
        lastActivity: '2026-10-01T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useCreateGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))

const trip = (id: string, name: string): PersonalTrip => ({
  id,
  name,
  startsOn: '2999-12-10',
  endsOn: '2999-12-17',
  budgetCents: 500_000_00,
  archivedAt: null,
})

/** The group detail only matters here for its back button, which is the same hook the real page uses. */
function GroupStub() {
  const goBack = useGoBack('/grupos')
  return (
    <>
      <button type="button" onClick={goBack}>
        Volver del grupo
      </button>
      <Link to="/grupos/g1/personas">Personas</Link>
    </>
  )
}

/** A page inside a group (Personas, Resumen…), whose back button is the shared header's. */
function GroupSubPageStub() {
  return <PageHeader title="Personas" fallbackTo="/grupos/g1" />
}

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

/**
 * Runs the real screens in a browser router, so the history is the browser's own: `entries` are visited in order (the
 * first one replaces the current entry) and `back()` is the browser's back button.
 */
async function setup(entries: string[]) {
  window.history.replaceState(null, '', entries[0])
  const routes: RouteObject[] = [
    {
      element: (
        <MovementSheetContext.Provider value={{ openNew: vi.fn(), openEdit: vi.fn() }}>
          <Where />
          <Outlet />
        </MovementSheetContext.Provider>
      ),
      children: [
        { path: '/', element: <Link to="/viajes">Ir a Viajes</Link> },
        { path: '/grupos', element: <p>lista de grupos</p> },
        { path: '/grupos/:id', element: <GroupStub /> },
        { path: '/grupos/:id/personas', element: <GroupSubPageStub /> },
        { path: '/viajes', element: <TripsPage /> },
        { path: '/viajes/:id', element: <PersonalTripPage /> },
      ],
    },
  ]
  const router = createBrowserRouter(routes)
  render(<RouterProvider router={router} />)
  for (const entry of entries.slice(1)) await act(() => router.navigate(entry))
  const where = () => screen.getByTestId('where').textContent
  const back = async () => {
    const popped = new Promise((resolve) =>
      window.addEventListener('popstate', resolve, { once: true }),
    )
    act(() => window.history.back())
    await popped
  }
  return { router, where, back, user: userEvent.setup() }
}

beforeEach(() => {
  state.trips = [trip('t1', 'Semana en Salta'), trip('t2', 'Finde en Bariloche')]
  state.createTrip.mockReset()
})

describe('Back navigation in Viajes', () => {
  it('from Viajes into a trip, back returns to the list, and back again to where Viajes was opened from', async () => {
    const { where, user } = await setup(['/'])
    await user.click(screen.getByRole('link', { name: 'Ir a Viajes' }))
    await user.click(await screen.findByRole('link', { name: /Semana en Salta/ }))
    await waitFor(() => expect(where()).toBe('/viajes/t1'))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
    expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('opening trip after trip never stacks or loops: every back retraces the same path', async () => {
    const { where, user } = await setup(['/', '/viajes'])
    await user.click(await screen.findByRole('link', { name: /Semana en Salta/ }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await user.click(await screen.findByRole('link', { name: /Finde en Bariloche/ }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await user.click(await screen.findByRole('link', { name: /Semana en Salta/ }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it("the browser back button does exactly what Moni's back button does", async () => {
    const { where, back, user } = await setup(['/', '/viajes'])
    await user.click(await screen.findByRole('link', { name: /Semana en Salta/ }))
    await waitFor(() => expect(where()).toBe('/viajes/t1'))
    await back()
    await waitFor(() => expect(where()).toBe('/viajes'))
    await back()
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('from a group trip in Viajes, back from the group returns to Viajes on "En grupo"', async () => {
    const { where, user } = await setup(['/', '/viajes'])
    await user.click(screen.getByRole('button', { name: 'En grupo' }))
    await waitFor(() => expect(where()).toBe('/viajes?tab=grupo'))
    await user.click(await screen.findByRole('link', { name: /Mar del Plata/ }))
    await waitFor(() => expect(where()).toBe('/grupos/g1'))
    await user.click(screen.getByRole('button', { name: 'Volver del grupo' }))
    await waitFor(() => expect(where()).toBe('/viajes?tab=grupo'))
    expect(screen.getByRole('link', { name: /Mar del Plata/ })).toBeInTheDocument()
    // Changing tabs replaces the entry: one back still leaves Viajes.
    await user.click(screen.getByRole('button', { name: 'Mis viajes' }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('a page inside a group goes back to the group without leaving a loop behind', async () => {
    const { where, user } = await setup(['/', '/viajes', '/grupos/g1'])
    await user.click(screen.getByRole('link', { name: 'Personas' }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/grupos/g1'))
    await user.click(screen.getByRole('button', { name: 'Volver del grupo' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
  })

  it('a group opened from Grupos goes back to Grupos', async () => {
    const { where, user } = await setup(['/grupos', '/grupos/g1'])
    await user.click(screen.getByRole('button', { name: 'Volver del grupo' }))
    await waitFor(() => expect(where()).toBe('/grupos'))
  })

  it('opening the + sheet and closing it adds nothing to the history', async () => {
    const { where, user } = await setup(['/', '/viajes'])
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    await waitFor(() => expect(where()).toBe('/viajes?nuevo=elegir'))
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('a trip just created opens, and back from it lands on the clean list (not on the open sheet)', async () => {
    state.createTrip.mockImplementation(async () => {
      const created = trip('t9', 'Cataratas')
      state.trips = [...state.trips, created]
      return created
    })
    const { where, user } = await setup(['/', '/viajes'])
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    await user.click(screen.getByRole('button', { name: /Viaje personal/ }))
    await user.type(screen.getByLabelText('Destino'), 'Cataratas')
    await user.type(screen.getByLabelText('Presupuesto'), '500000')
    await user.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(await screen.findByText('Cataratas', { selector: 'h1' })).toBeVisible()
    await waitFor(() => expect(where()).toBe('/viajes/t9'))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('a trip opened directly (no history) goes back to Viajes, then to Inicio, without bouncing', async () => {
    const { where, user } = await setup(['/viajes/t1'])
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/viajes'))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(where()).toBe('/'))
  })
})
