import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastContext } from '@/shared/ui/toastContext'
import type { GroupMember } from '../domain/group'
import { groupKeys } from './queryKeys'
import { useNewMemberNotice } from './useNewMemberNotice'

const ME = 'user-me'
const GROUP = 'group-1'

const repo = vi.hoisted(() => ({ listGroupMembers: vi.fn() }))
vi.mock('./groupsRepository', () => repo)
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: ME } }) }))

const member = (
  userId: string,
  displayName: string | null,
  leftAt: string | null = null,
): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-30T10:00:00Z',
  leftAt,
})

function setup() {
  const show = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  renderHook(() => useNewMemberNotice(GROUP), { wrapper })
  const refresh = () =>
    act(() => client.invalidateQueries({ queryKey: groupKeys.members(ME, GROUP) }))
  /** The first list is loaded and taken as the baseline. */
  const loaded = () =>
    waitFor(() => expect(client.getQueryData(groupKeys.members(ME, GROUP))).toBeDefined())
  return { show, refresh, loaded }
}

describe('useNewMemberNotice', () => {
  beforeEach(() => repo.listGroupMembers.mockReset())

  it('announces who joins while the group is open, once, with their first name', async () => {
    repo.listGroupMembers.mockResolvedValue([member(ME, 'Ana Pérez')])
    const { show, refresh, loaded } = setup()
    await loaded()
    // Who was already there is not announced.
    expect(show).not.toHaveBeenCalled()

    repo.listGroupMembers.mockResolvedValue([
      member(ME, 'Ana Pérez'),
      member('u-maria', 'María López'),
    ])
    await refresh()
    await waitFor(() => expect(show).toHaveBeenCalledWith('¡María se unió al grupo!'))

    // The same list again does not announce them twice.
    await refresh()
    await waitFor(() => expect(repo.listGroupMembers).toHaveBeenCalledTimes(3))
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('does not announce the person to themself, nor who already left', async () => {
    repo.listGroupMembers.mockResolvedValue([member('u-a', 'Ana')])
    const { show, refresh, loaded } = setup()
    await loaded()
    repo.listGroupMembers.mockResolvedValue([
      member('u-a', 'Ana'),
      member(ME, 'Yo'),
      member('u-z', 'Zoe', '2026-10-30T11:00:00Z'),
    ])
    await refresh()
    await waitFor(() => expect(repo.listGroupMembers).toHaveBeenCalledTimes(2))
    expect(show).not.toHaveBeenCalled()
  })

  it('uses a neutral name when the new member has no profile name', async () => {
    repo.listGroupMembers.mockResolvedValue([member(ME, 'Ana')])
    const { show, refresh, loaded } = setup()
    await loaded()
    repo.listGroupMembers.mockResolvedValue([member(ME, 'Ana'), member('u-x', null)])
    await refresh()
    await waitFor(() => expect(show).toHaveBeenCalledWith('¡Alguien se unió al grupo!'))
  })
})
