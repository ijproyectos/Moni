import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { saveDraft, loadDraft } from '@/features/onboarding/domain/localPreferences'
import { AuthContext, type AuthState } from './authContext'
import { UserDataGuard } from './UserDataGuard'

const authFor = (id: string | null): AuthState => {
  const user = id ? ({ id } as NonNullable<AuthState['user']>) : null
  return {
    user,
    session: user ? ({ user } as NonNullable<AuthState['session']>) : null,
    isLoading: false,
  }
}

const draft = { goals: [], slugs: null, custom: [], usesDollars: false, notificationsOptIn: null }

function tree(client: QueryClient, auth: AuthState) {
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <UserDataGuard />
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('UserDataGuard', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('does not leak user A data to user B after sign-out and sign-in', () => {
    const client = new QueryClient()
    client.setQueryData(['accounts', 'user-a'], [{ name: 'Cuenta de A' }])
    saveDraft('user-a', draft)

    const { rerender } = render(tree(client, authFor('user-a')))
    expect(client.getQueryData(['accounts', 'user-a'])).toBeDefined()

    rerender(tree(client, authFor(null)))
    rerender(tree(client, authFor('user-b')))

    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(loadDraft('user-a')).toBeNull()
  })

  it('clears the cache on a direct user switch', () => {
    const client = new QueryClient()
    const { rerender } = render(tree(client, authFor('user-a')))
    client.setQueryData(['profile', 'user-a'], { name: 'A' })
    rerender(tree(client, authFor('user-b')))
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('keeps the cache while the same user stays signed in', () => {
    const client = new QueryClient()
    const { rerender } = render(tree(client, authFor('user-a')))
    client.setQueryData(['profile', 'user-a'], { name: 'A' })
    rerender(tree(client, authFor('user-a')))
    expect(client.getQueryData(['profile', 'user-a'])).toEqual({ name: 'A' })
  })
})
