import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { PlusRequiredError } from '@/shared/lib/errors'
import { usePlus, useRedeemPromoCode } from './usePlus'
import { plusKeys } from './queryKeys'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const FUTURE = new Date(Date.now() + 20 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('usePlus', () => {
  beforeEach(() => rpc.mockReset())

  it('is Free when my_plus_status is null, and caches per user', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => usePlus(), { wrapper })
    await waitFor(() => expect(result.current.isFree).toBe(true))
    expect(result.current.isPlus).toBe(false)
    expect(rpc).toHaveBeenCalledWith('my_plus_status')
    expect(client.getQueryData(plusKeys.status('u1'))).toBeNull()
  })

  it('is Plus while the expiry is in the future', async () => {
    rpc.mockResolvedValue({ data: FUTURE, error: null })
    const { wrapper } = setup()
    const { result } = renderHook(() => usePlus(), { wrapper })
    await waitFor(() => expect(result.current.isPlus).toBe(true))
    expect(result.current.isFree).toBe(false)
    expect(result.current.expiresAt).toBe(FUTURE)
  })

  it('does not gate when the status cannot be read (the server decides)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } })
    const { wrapper } = setup()
    const { result } = renderHook(() => usePlus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFree).toBe(false)
    expect(result.current.isPlus).toBe(false)
  })

  it('PlusRequiredError is an Error with the stable code as message', () => {
    expect(new PlusRequiredError().message).toBe('plus_required')
  })
})

describe('useRedeemPromoCode', () => {
  beforeEach(() => rpc.mockReset())

  it('updates the cached status on success so Plus shows without a reload', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'redeem_promo_code' ? { data: FUTURE, error: null } : { data: FUTURE, error: null },
    )
    const { client, wrapper } = setup()
    client.setQueryData(plusKeys.status('u1'), null)
    const { result } = renderHook(() => ({ plus: usePlus(), redeem: useRedeemPromoCode() }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.plus.isFree).toBe(true))
    await act(async () => {
      await result.current.redeem.mutateAsync('Moni Plus')
    })
    expect(rpc).toHaveBeenCalledWith('redeem_promo_code', { p_code: 'Moni Plus' })
    await waitFor(() => expect(result.current.plus.isPlus).toBe(true))
  })

  it('rejects a wrong code (null) with promo_invalid', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRedeemPromoCode(), { wrapper })
    await expect(result.current.mutateAsync('nope')).rejects.toThrow('promo_invalid')
  })

  it('rejects an already used code whose period ended', async () => {
    rpc.mockResolvedValue({ data: PAST, error: null })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRedeemPromoCode(), { wrapper })
    await expect(result.current.mutateAsync('moniplus')).rejects.toThrow('promo_already_used')
  })

  it('surfaces the throttle error from the database', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'too_many_attempts' } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRedeemPromoCode(), { wrapper })
    await expect(result.current.mutateAsync('x')).rejects.toMatchObject({
      message: 'too_many_attempts',
    })
  })
})
