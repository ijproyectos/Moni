import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearSuspendedNotice, markSuspendedNotice } from '@/features/auth/domain/suspendedNotice'
import { WelcomePage } from './WelcomePage'

const signInWithOAuth = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithOAuth } }),
}))

describe('WelcomePage', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null })
    clearSuspendedNotice()
  })

  it('tells a suspended account why it was refused, until they try again', async () => {
    markSuspendedNotice()
    render(<WelcomePage />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tu cuenta está suspendida. Escribinos a soporte.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }))
    expect(screen.queryByText(/suspendida/)).not.toBeInTheDocument()
  })

  it('introduces Moni with its three benefits', () => {
    render(<WelcomePage />)
    expect(screen.getByRole('heading', { name: 'Hola, soy Moni' })).toBeInTheDocument()
    for (const t of ['Tu disponible del día', '¿Me conviene?', 'Gastos compartidos'])
      expect(screen.getByText(t)).toBeInTheDocument()
  })

  it('has no suspension text on a normal visit', () => {
    render(<WelcomePage />)
    expect(screen.queryByText(/suspendida/)).not.toBeInTheDocument()
  })

  it.each(['Empezar', 'Ya tengo cuenta'])('"%s" starts Google OAuth', async (label) => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarte con Google')
  })
})
