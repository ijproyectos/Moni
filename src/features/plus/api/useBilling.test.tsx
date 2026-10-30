import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { readCheckoutBaseline } from './checkoutMarker'
import { plusKeys } from './queryKeys'
import { useCancelSubscription, useStartCheckout, useSubscriptionState } from './useBilling'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const INIT = 'https://www.mercadopago.com.ar/subscriptions/checkout?id=1'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('billing hooks', () => {
  beforeEach(() => {
    invoke.mockReset()
    sessionStorage.clear()
  })

  it('useSubscriptionState caches the state per user', async () => {
    invoke.mockResolvedValue({ data: { status: 'paused' }, error: null })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useSubscriptionState(), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('paused'))
    expect(client.getQueryData(plusKeys.subscription('u1'))).toBe('paused')
  })

  it('useStartCheckout remembers the pre-checkout expiry and navigates to the validated URL', async () => {
    invoke.mockResolvedValue({ data: { init_point: INIT, status: 'pending' }, error: null })
    const navigate = vi.fn()
    const { client, wrapper } = setup()
    client.setQueryData(plusKeys.status('u1'), '2027-01-01T00:00:00Z')
    const { result } = renderHook(() => useStartCheckout(navigate), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(navigate).toHaveBeenCalledWith(INIT)
    expect(readCheckoutBaseline('u1')).toBe('2027-01-01T00:00:00Z')
    expect(readCheckoutBaseline('someone-else')).toBeUndefined()
  })

  it('useStartCheckout never navigates on a bad init_point', async () => {
    invoke.mockResolvedValue({ data: { init_point: 'https://evil.example' }, error: null })
    const navigate = vi.fn()
    const { wrapper } = setup()
    const { result } = renderHook(() => useStartCheckout(navigate), { wrapper })
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined)
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('useCancelSubscription updates the subscription and leaves the Plus expiry alone', async () => {
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => ({
      data: { status: opts.body.action === 'cancel' ? 'cancelled' : 'authorized' },
      error: null,
    }))
    const { client, wrapper } = setup()
    client.setQueryData(plusKeys.status('u1'), '2027-01-01T00:00:00Z')
    const { result } = renderHook(() => useCancelSubscription(), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(client.getQueryData(plusKeys.subscription('u1'))).toBe('cancelled')
    expect(client.getQueryData(plusKeys.status('u1'))).toBe('2027-01-01T00:00:00Z')
  })
})
