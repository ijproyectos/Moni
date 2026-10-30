import { previewGroupInvite } from './groupsRepository'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ supabase: null, getSupabase: () => ({ rpc }) }))

describe('previewGroupInvite', () => {
  beforeEach(() => rpc.mockReset())

  it('returns the real group name the server answers with', async () => {
    rpc.mockResolvedValue({ data: ' Viaje a Brasil ', error: null })
    await expect(previewGroupInvite('ABCD2345')).resolves.toEqual({
      status: 'found',
      groupName: 'Viaje a Brasil',
    })
    expect(rpc).toHaveBeenCalledWith('preview_group_invite', { p_code: 'ABCD2345' })
  })

  it('treats NULL as an invalid or expired code', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(previewGroupInvite('ABCD2345')).resolves.toEqual({ status: 'invalid' })
  })

  it.each(['PGRST202', '42883'])(
    'says "unavailable" (and invents nothing) while the database lacks the function (%s)',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'missing' } })
      await expect(previewGroupInvite('ABCD2345')).resolves.toEqual({ status: 'unavailable' })
    },
  )

  it('surfaces any other error (offline, throttled) instead of hiding it', async () => {
    const error = { code: '54000', message: 'too_many_attempts' }
    rpc.mockResolvedValue({ data: null, error })
    await expect(previewGroupInvite('ABCD2345')).rejects.toBe(error)
  })
})
