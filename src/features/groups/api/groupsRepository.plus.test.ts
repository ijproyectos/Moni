import { PlusRequiredError } from '@/shared/lib/errors'
import { createGroup } from './groupsRepository'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

describe('createGroup free plan limit', () => {
  beforeEach(() => rpc.mockReset())

  it('maps the plus_required RPC error to a typed PlusRequiredError', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'plus_required' } })
    await expect(createGroup({ name: 'Segundo', kind: 'amigos' })).rejects.toBeInstanceOf(
      PlusRequiredError,
    )
  })

  it('keeps other errors untouched', async () => {
    const error = { code: '22023', message: 'invalid_group_name' }
    rpc.mockResolvedValue({ data: null, error })
    await expect(createGroup({ name: ' ', kind: 'casa' })).rejects.toBe(error)
  })
})
