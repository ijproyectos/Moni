import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signIn = vi.hoisted(() => vi.fn())
vi.mock('../api/adminAuth', () => ({ signInAdminWithGoogle: signIn }))

import { DeniedScreen, SignInScreen } from './AdminScreens'

describe('admin screens', () => {
  beforeEach(() => {
    signIn.mockReset()
    signIn.mockResolvedValue(undefined)
  })

  it('shows the Google button and the inactivity notice when asked', () => {
    render(<SignInScreen inactivity />)
    expect(screen.getByRole('button', { name: 'Entrar con Google' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Cerramos la sesión por inactividad')
  })

  it('has no notice on a plain visit', () => {
    render(<SignInScreen inactivity={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the signed-in email and the reason, then switches account with the chooser', async () => {
    const onSwitch = vi.fn().mockResolvedValue(undefined)
    render(<DeniedScreen email="x@example.com" reason="email_not_confirmed" onSwitch={onSwitch} />)
    expect(screen.getByText('x@example.com')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Email sin confirmar')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar con otra cuenta de Google' }))
    expect(onSwitch).toHaveBeenCalledOnce()
    expect(signIn).toHaveBeenCalledWith(true)
  })

  it('explains an account that is not allowlisted', () => {
    render(<DeniedScreen email="x@example.com" reason="not_allowed" onSwitch={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cuenta no habilitada')
  })
})
