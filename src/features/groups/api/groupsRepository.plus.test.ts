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
    await expect(createGroup({ name: ' ', kind: 'hogar' })).rejects.toBe(error)
  })

  it('sends Hogar as "casa": the database takes it before and after the rename (publishing order does not matter)', async () => {
    rpc.mockResolvedValue({ data: 'g1', error: null })
    await createGroup({ name: 'Depto', kind: 'hogar' })
    expect(rpc).toHaveBeenLastCalledWith('create_group', { p_name: 'Depto', p_kind: 'casa' })
    await createGroup({ name: 'Amigos', kind: 'amigos' })
    expect(rpc).toHaveBeenLastCalledWith('create_group', { p_name: 'Amigos', p_kind: 'amigos' })
  })
})
