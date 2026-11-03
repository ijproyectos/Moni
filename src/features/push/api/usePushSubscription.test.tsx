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

  it('is denied when the browser blocks notifications, and never tries to subscribe', () => {
    fake = installFakePush({ permission: 'denied' })
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.state).toBe('denied')
    expect(fake.subscribe).not.toHaveBeenCalled()
  })

  it('has no way to turn the notices off', () => {
    fake = installFakePush({ permission: 'granted', existing: true })
    const { result } = renderHook(() => usePushSubscription())
    expect(Object.keys(result.current).sort()).toEqual(['enable', 'needsInstall', 'state'])
  })

  it('does not ask or subscribe on its own while the permission is undecided', async () => {
    fake = installFakePush({ permission: 'default' })
    const { result } = renderHook(() => usePushSubscription())
    await Promise.resolve()
    expect(result.current.state).toBe('off')
    expect(fake.requestPermission).not.toHaveBeenCalled()
    expect(fake.subscribe).not.toHaveBeenCalled()
  })

  it('with the permission granted, keeps an existing subscription and refreshes its server row', async () => {
    fake = installFakePush({ permission: 'granted', existing: true })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.state).toBe('on'))
    expect(fake.subscribe).not.toHaveBeenCalled()
    expect(fake.subscription.unsubscribe).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything())
  })

  it('with the permission granted and no subscription, subscribes silently', async () => {
    fake = installFakePush({ permission: 'granted' })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.state).toBe('on'))
    expect(fake.requestPermission).not.toHaveBeenCalled()
    expect(fake.subscribe).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', {
      p_endpoint: 'https://push.example.com/abc',
      p_p256dh: 'p',
      p_auth: 'a',
      p_user_agent: navigator.userAgent,
    })
  })

  it('renews a subscription made with an old VAPID key', async () => {
    fake = installFakePush({
      permission: 'granted',
      existing: true,
      existingKey: new Uint8Array([1, 2, 3]),
    })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.state).toBe('on'))
    expect(fake.subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(fake.subscribe).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything())
  })

  it('renews an expired subscription', async () => {
    fake = installFakePush({
      permission: 'granted',
      existing: true,
      expirationTime: Date.now() - 1,
    })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.state).toBe('on'))
    expect(fake.subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(fake.subscribe).toHaveBeenCalledTimes(1)
  })

  it('stays off (and retries on the next start) when the server rejects the registration', async () => {
    fake = installFakePush({ permission: 'granted' })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(result.current.state).toBe('off')
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

  it('enable() reports the failure and goes back to off when the server rejects it', async () => {
    fake = installFakePush({})
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await expect(result.current.enable()).rejects.toThrow('boom')
    })
    expect(result.current.state).toBe('off')
  })
})
