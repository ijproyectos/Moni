import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}))

function Probe() {
  const { user, isLoading } = useAuth()
  return <p>{isLoading ? 'cargando' : (user?.id ?? 'sin sesión')}</p>
}

const stored = {
  access_token: 'expired',
  refresh_token: 'r',
  expires_at: 1,
  user: { id: 'user-a' },
}

describe('AuthProvider while offline', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('keeps the stored login when the refresh fails for lack of network', async () => {
    window.localStorage.setItem('sb-abc-auth-token', JSON.stringify(stored))
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('user-a')).toBeInTheDocument()
  })

  it('still signs out when there is genuinely no stored session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
  })

  it('does not resurrect a stored session after a non-network failure', async () => {
    window.localStorage.setItem('sb-abc-auth-token', JSON.stringify(stored))
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
  })
})
