import { QueryClient } from '@tanstack/react-query'
import { saveDraft, loadDraft } from '@/features/onboarding/domain/localPreferences'
import { signOut, wipeLocalAccountData } from './authActions'

const supabaseSignOut = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signOut: supabaseSignOut } }),
}))

describe('signOut', () => {
  beforeEach(() => {
    supabaseSignOut.mockReset()
    window.sessionStorage.clear()
  })

  it('clears the query cache and onboarding drafts', async () => {
    supabaseSignOut.mockResolvedValue({ error: null })
    const client = new QueryClient()
    client.setQueryData(['transactions', 'user-a'], [1, 2])
    saveDraft('user-a', {
      goals: [],
      slugs: null,
      custom: [],
      usesDollars: false,
      notificationsOptIn: null,
    })
    await signOut(client)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(loadDraft('user-a')).toBeNull()
  })

  it('keeps the cache when the sign-out fails', async () => {
    supabaseSignOut.mockResolvedValue({ error: new Error('offline') })
    const client = new QueryClient()
    client.setQueryData(['transactions', 'user-a'], [1])
    await expect(signOut(client)).rejects.toThrow('offline')
    expect(client.getQueryData(['transactions', 'user-a'])).toEqual([1])
  })
})

describe('wipeLocalAccountData (after the account was deleted)', () => {
  beforeEach(() => {
    supabaseSignOut.mockReset()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('closes the session locally, clears the cache and every Moni / auth key of the device, and keeps only the theme', async () => {
    supabaseSignOut.mockResolvedValue({ error: null })
    window.localStorage.setItem('moni.theme', 'dark')
    window.localStorage.setItem('moni:guide-done:abc', '1')
    window.localStorage.setItem('moni-center-dismissed-abc', '[]')
    window.localStorage.setItem('sb-project-auth-token', '{"access_token":"x"}')
    window.localStorage.setItem('other-site-key', 'keep')
    window.sessionStorage.setItem('moni.agent.position', '{}')
    const client = new QueryClient()
    client.setQueryData(['x'], 1)
    await wipeLocalAccountData(client)
    expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(client.getQueryData(['x'])).toBeUndefined()
    expect(window.localStorage.getItem('moni.theme')).toBe('dark')
    expect(window.localStorage.getItem('other-site-key')).toBe('keep')
    for (const key of ['moni:guide-done:abc', 'moni-center-dismissed-abc', 'sb-project-auth-token']) expect(window.localStorage.getItem(key)).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('still wipes everything when the server session cannot be closed (the account is gone)', async () => {
    supabaseSignOut.mockRejectedValue(new Error('403'))
    window.localStorage.setItem('moni:x', '1')
    await expect(wipeLocalAccountData(new QueryClient())).resolves.toBeUndefined()
    expect(window.localStorage.getItem('moni:x')).toBeNull()
  })
})
