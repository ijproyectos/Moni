import { QueryClient } from '@tanstack/react-query'
import { saveDraft, loadDraft } from '@/features/onboarding/domain/localPreferences'
import { signOut } from './authActions'

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
