import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PlusThanksPage } from './PlusThanksPage'

const rpc = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc, functions: { invoke } }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString()

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PlusThanksPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PlusThanksPage', () => {
  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { status: 'authorized' }, error: null })
    sessionStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => vi.useRealTimers())

  it('starts initializing, then processing while Plus is not active yet', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    renderIt()
    expect(screen.getByText('Un momento…')).toBeInTheDocument()
    expect(await screen.findByText('Procesando tu pago')).toBeInTheDocument()
  })

  it('shows success as soon as the webhook credited Plus', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: FUTURE, error: null })
    renderIt()
    expect(await screen.findByText('Procesando tu pago')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(2500))
    expect(await screen.findByText('¡Ya sos Moni Plus!')).toBeInTheDocument()
  })

  it('stops polling after the backoff and says activation can take a few minutes', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    renderIt()
    await screen.findByText('Procesando tu pago')
    for (let i = 0; i < 8; i++) await act(() => vi.advanceTimersByTimeAsync(31_000))
    expect(await screen.findByText('Tu pago todavía se está activando')).toBeInTheDocument()
    expect(screen.getByText(/puede tardar unos minutos/)).toBeInTheDocument()
    const calls = rpc.mock.calls.length
    for (let i = 0; i < 4; i++) await act(() => vi.advanceTimersByTimeAsync(31_000))
    expect(rpc.mock.calls.length).toBe(calls)
  })

  it('shows an actionable error when the status cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } })
    renderIt()
    expect(await screen.findByText('No pudimos confirmar tu suscripción')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar de nuevo' })).toBeInTheDocument()
  })

  it('does not call an already-Plus person activated until the expiry moves', async () => {
    sessionStorage.setItem('moni.plus.checkout', JSON.stringify({ userId: 'u1', baseline: FUTURE }))
    rpc.mockResolvedValue({ data: FUTURE, error: null })
    renderIt()
    expect(await screen.findByText('Procesando tu pago')).toBeInTheDocument()
  })
})
