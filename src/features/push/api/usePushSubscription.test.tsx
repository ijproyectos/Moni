import { act, renderHook, waitFor } from '@testing-library/react'
import { installFakePush, type FakePush } from './pushTestEnv'
import { usePushSubscription } from './usePushSubscription'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

let fake: FakePush | null = null
afterEach(() => {
  fake?.restore()
  fake = null
  vi.unstubAllEnvs()
})
beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
})

describe('usePushSubscription', () => {
  it('is unsupported without push APIs', () => {
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.state).toBe('unsupported')
    expect(result.current.needsInstall).toBe(false)
  })

  it('asks iPhone users to install the app first', () => {
    fake = installFakePush({ userAgent: IPHONE, standalone: false })
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.state).toBe('unsupported')
    expect(result.current.needsInstall).toBe(true)
  })

  it('is denied when the browser blocks notifications', () => {
    fake = installFakePush({ permission: 'denied' })
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.state).toBe('denied')
  })

  it('starts on when this device already has a subscription, and refreshes it', async () => {
    fake = installFakePush({ permission: 'granted', existing: true })
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.state).toBe('off')
    await waitFor(() => expect(result.current.state).toBe('on'))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything()),
    )
  })

  it('enable() asks permission, subscribes and registers the endpoint', async () => {
    fake = installFakePush({})
    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await result.current.enable()
    })
    expect(fake.requestPermission).toHaveBeenCalledTimes(1)
    expect(fake.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    )
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', {
      p_endpoint: 'https://push.example.com/abc',
      p_p256dh: 'p',
      p_auth: 'a',
      p_user_agent: navigator.userAgent,
    })
    expect(result.current.state).toBe('on')
  })

  it('enable() ends denied (and never subscribes) when the person refuses', async () => {
    fake = installFakePush({ requestResult: 'denied' })
    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await result.current.enable()
    })
    expect(fake.subscribe).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(result.current.state).toBe('denied')
  })

  it('enable() rolls the local subscription back when the server rejects it', async () => {
    fake = installFakePush({})
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await expect(result.current.enable()).rejects.toThrow('boom')
    })
    expect(fake.subscription.unsubscribe).toHaveBeenCalled()
    expect(result.current.state).toBe('off')
  })

  it('disable() unsubscribes and removes the endpoint', async () => {
    fake = installFakePush({ permission: 'granted', existing: true })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.state).toBe('on'))
    await act(async () => {
      await result.current.disable()
    })
    expect(fake.subscription.unsubscribe).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('remove_push_subscription', {
      p_endpoint: 'https://push.example.com/abc',
    })
    expect(result.current.state).toBe('off')
  })
})
