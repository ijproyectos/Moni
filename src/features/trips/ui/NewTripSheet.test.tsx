import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { NewTripSheet } from './NewTripSheet'

const state = vi.hoisted(() => ({ plan: { isPlus: false, isFree: true, isLoading: false }, trips: [] as unknown[], groupTrips: [] as { groupId: string }[], groups: [] as { id: string; role: string }[] }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => state.plan }))
vi.mock('@/features/plus/ui/PlusSheet', () => ({ PlusSheet: () => null }))
vi.mock('../api/useTrips', () => ({
  useTrips: () => ({ data: state.trips }),
  useGroupTrips: () => ({ data: state.groupTrips }),
  useSetGroupTrip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('./PersonalTripForm', () => ({ PersonalTripForm: () => <div role="dialog" aria-label="Formulario de viaje" /> }))
vi.mock('@/features/groups/api/useGroups', () => ({ useCreateGroup: () => ({ mutateAsync: vi.fn() }), useMyGroups: () => ({ data: state.groups }) }))
vi.mock('@/features/groups/mock/overlayStore', () => ({ useOverlays: () => ({}) }))

const trip = (over: object) => ({ id: 't', name: 'Bariloche', startsOn: '2999-01-01', endsOn: '2999-01-10', archivedAt: null, ...over })
const setup = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <NewTripSheet start="personal" onClose={() => undefined} onKindChosen={() => undefined} />
      </ToastProvider>
    </MemoryRouter>,
  )

describe('NewTripSheet (free plan: one trip in total)', () => {
  beforeEach(() => {
    state.plan = { isPlus: false, isFree: true, isLoading: false }
    state.trips = []
    state.groupTrips = []
    state.groups = []
  })

  it('Free with no trip can create one', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Formulario de viaje' })).toBeInTheDocument()
  })

  it('Free with a trip gets the promo, even when that trip ended or was archived (closing a trip never frees the limit)', () => {
    for (const t of [trip({}), trip({ endsOn: '2020-01-10', startsOn: '2020-01-01' }), trip({ archivedAt: '2026-01-01T00:00:00Z' })]) {
      state.trips = [t]
      const { unmount } = setup()
      expect(screen.getByRole('dialog', { name: 'Tu próxima aventura te espera' })).toBeInTheDocument()
      unmount()
    }
  })

  it('a trip of a group I administer counts too (personal and group trips share the one free trip)', () => {
    state.groupTrips = [{ groupId: 'g1' }]
    state.groups = [{ id: 'g1', role: 'owner' }]
    setup()
    expect(screen.getByRole('dialog', { name: 'Tu próxima aventura te espera' })).toBeInTheDocument()
  })

  it('the trip of a group somebody else made does not count against me', () => {
    state.groupTrips = [{ groupId: 'g2' }]
    state.groups = [{ id: 'g2', role: 'member' }]
    setup()
    expect(screen.getByRole('dialog', { name: 'Formulario de viaje' })).toBeInTheDocument()
  })

  it('Moni Plus has no limit', () => {
    state.plan = { isPlus: true, isFree: false, isLoading: false }
    state.trips = [trip({}), trip({ id: 'u' })]
    setup()
    expect(screen.getByRole('dialog', { name: 'Formulario de viaje' })).toBeInTheDocument()
  })
})
