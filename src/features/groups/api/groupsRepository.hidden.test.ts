import { listHiddenAndArchivedGroups } from './groupsRepository'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

const row = (id: string, hidden_at: string | null, archived_at: string | null) => ({
  id, name: 'IJ Society', kind: 'amigos', role: 'member', member_count: 3, my_net: 0,
  last_activity: '2026-11-20T10:00:00Z', hidden_at, archived_at,
})

describe('listHiddenAndArchivedGroups', () => {
  it('drops a group archived for everybody that I already removed from my list, even if the server still returns it', async () => {
    rpc.mockResolvedValue({
      data: [row('a', null, '2026-11-21T00:00:00Z'), row('b', '2026-11-21T00:00:00Z', '2026-11-21T00:00:00Z'), row('c', '2026-11-21T00:00:00Z', null)],
      error: null,
    })
    const list = await listHiddenAndArchivedGroups()
    expect(list.map((g) => g.id)).toEqual(['a', 'c'])
  })
})
