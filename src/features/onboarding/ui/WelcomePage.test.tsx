import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomePage } from './WelcomePage'

const signInWithOAuth = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithOAuth } }),
}))

describe('WelcomePage', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null })
  })

  it.each(['Arrancar', 'Ya tengo cuenta'])('"%s" starts Google OAuth', async (label) => {
    render(<WelcomePage />)
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('shows an error when Google sign-in fails', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('boom') })
    render(<WelcomePage />)
    await userEvent.click(screen.getByRole('button', { name: 'Arrancar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarte con Google')
  })
})
