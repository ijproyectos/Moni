import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext, type AuthState } from '../api/authContext'
import { RequireAuth, WELCOME_PATH } from './guards'

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
