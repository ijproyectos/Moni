import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { MyGroup } from '../domain/group'
import { useJoinGroup } from './useGroups'
import { groupKeys } from './queryKeys'

const USER = 'user-1'
const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'

const repo = vi.hoisted(() => ({
  joinGroup: vi.fn(),
  listMyGroups: vi.fn(),
}))
vi.mock('./groupsRepository', () => repo)
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: USER } }) }))

const group = (id: string): MyGroup => ({
  id,
  name: id,
  kind: 'casa',
  role: 'member',
  memberCount: 2,
  myNetCents: 0,
  lastActivity: '2026-10-01T00:00:00Z',
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useJoinGroup(), { wrapper }) }
}

describe('useJoinGroup', () => {
  beforeEach(() => {
    repo.joinGroup.mockReset()
    repo.listMyGroups.mockReset()
  })

  it('refreshes the groups list so the new group appears even if Grupos is not mounted', async () => {
    let joined = false
    repo.listMyGroups.mockImplementation(async () =>
      joined ? [group(OLD), group(NEW)] : [group(OLD)],
    )
    repo.joinGroup.mockImplementation(async () => {
      joined = true
      return NEW
    })
    const { client, result } = setup()
    // A previously loaded (and still "fresh") list that lacks the new group.
    client.setQueryData(groupKeys.list(USER), [group(OLD)])

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.mutateAsync('ABCD2345')
    })

    expect(outcome).toEqual({ groupId: NEW, alreadyMember: false })
    await waitFor(() =>
      expect(client.getQueryData<MyGroup[]>(groupKeys.list(USER))?.map((g) => g.id)).toEqual([
        OLD,
        NEW,
      ]),
    )
  })

  it('flags a code used by someone who is already a member', async () => {
    repo.listMyGroups.mockResolvedValue([group(OLD)])
    repo.joinGroup.mockResolvedValue(OLD)
    const { result } = setup()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.mutateAsync('ABCD2345')
    })
    expect(outcome).toEqual({ groupId: OLD, alreadyMember: true })
  })

  it('still joins when the membership check cannot load', async () => {
    repo.listMyGroups.mockRejectedValue(new Error('network'))
    repo.joinGroup.mockResolvedValue(NEW)
    const { result } = setup()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.mutateAsync('ABCD2345')
    })
    expect(outcome).toEqual({ groupId: NEW, alreadyMember: false })
  })
})
