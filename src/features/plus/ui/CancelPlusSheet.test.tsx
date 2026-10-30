import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CancelPlusSheet } from './CancelPlusSheet'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function renderIt(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CancelPlusSheet expiresAt="2026-12-15T12:00:00Z" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onClose }
}

describe('CancelPlusSheet', () => {
  beforeEach(() => invoke.mockReset())

  it('asks first, says Plus stays until the paid date, and does nothing on "Mejor no"', async () => {
    const { user, onClose } = renderIt()
    expect(
      screen.getByRole('alertdialog', { name: '¿Cancelar la suscripción?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Seguís con Moni Plus hasta el 15\/12\/2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mejor no' }))
    expect(invoke).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('cancels on confirm and closes', async () => {
    invoke.mockResolvedValue({ data: { status: 'cancelled' }, error: null })
    const { user, onClose } = renderIt()
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('plus-subscription', { body: { action: 'cancel' } })
  })

  it('shows the error and stays open when it fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('x') })
    const { user, onClose } = renderIt()
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Probá de nuevo/)
    expect(onClose).not.toHaveBeenCalled()
  })
})
