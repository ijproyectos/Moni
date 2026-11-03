import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext, type AuthState } from '../api/authContext'
import { RequireActiveAccount, RequireAuth, WELCOME_PATH } from './guards'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ rpc, auth: { signOut: vi.fn() } }),
}))

function renderWithAuth(auth: AuthState) {
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path={WELCOME_PATH} element={<p>welcome</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>private</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RequireAuth', () => {
  it('redirects anonymous users to the welcome screen', async () => {
    renderWithAuth({ session: null, user: null, isLoading: false })
    expect(await screen.findByText('welcome')).toBeInTheDocument()
    expect(screen.queryByText('private')).not.toBeInTheDocument()
  })

  it('shows a loader while the session is being restored', () => {
    renderWithAuth({ session: null, user: null, isLoading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders private content for authenticated users', async () => {
    const user = { id: 'user-a' } as NonNullable<AuthState['user']>
    const session = { user } as NonNullable<AuthState['session']>
    renderWithAuth({ session, user, isLoading: false })
    expect(await screen.findByText('private')).toBeInTheDocument()
  })
})

describe('RequireActiveAccount', () => {
  const user = { id: 'user-a' } as NonNullable<AuthState['user']>
  const session = { user } as NonNullable<AuthState['session']>

  function renderGate() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ session, user, isLoading: false }}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<RequireActiveAccount />}>
                <Route path="/" element={<p>private</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  }

  beforeEach(() => rpc.mockReset())

  it('lets an active account through', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    renderGate()
    expect(await screen.findByText('private')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('my_account_suspended')
  })

  it('shows the suspension notice, and nothing of the app, to a suspended account', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    renderGate()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu cuenta está suspendida. Escribinos a soporte.',
    )
    expect(screen.queryByText('private')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('does not lock anybody out when the check itself fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
    renderGate()
    expect(await screen.findByText('private')).toBeInTheDocument()
  })
})
