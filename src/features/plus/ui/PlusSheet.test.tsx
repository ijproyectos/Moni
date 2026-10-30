import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlusSheet } from './PlusSheet'
import { PlusBadge } from './PlusBadge'

const rpc = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc, functions: { invoke } }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  return userEvent.setup()
}

describe('PlusSheet', () => {
  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { status: 'none' }, error: null })
    vi.useRealTimers()
  })

  it('offers the Mercado Pago subscription and still asks for a promo code', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    renderWithClient(<PlusSheet reason="group" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Tu plan Free tiene un grupo' })).toBeInTheDocument()
    expect(screen.getByText(/Pagás con Mercado Pago/)).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Suscribirme · $2.999/mes' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Canjear código' })).toBeDisabled()
  })

  it('redeems a code and shows the expiry date', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'redeem_promo_code'
        ? { data: new Date(Date.now() + 30 * 86_400_000).toISOString(), error: null }
        : { data: null, error: null },
    )
    const user = renderWithClient(<PlusSheet onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Código de acceso'), 'Moni Plus')
    await user.click(screen.getByRole('button', { name: 'Canjear código' }))
    expect(await screen.findByText(/Activo hasta el \d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('redeem_promo_code', { p_code: 'Moni Plus' })
  })

  it('shows a friendly error for a wrong code and keeps the form', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const user = renderWithClient(<PlusSheet onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Código de acceso'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Canjear código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/código no es válido/)
    expect(screen.getByLabelText('Código de acceso')).toBeInTheDocument()
  })

  it('shows the active state when the person is already on Plus', async () => {
    rpc.mockResolvedValue({
      data: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      error: null,
    })
    renderWithClient(<PlusSheet onClose={vi.fn()} />)
    expect(await screen.findByText(/Activo hasta el/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Código de acceso')).not.toBeInTheDocument()
  })
})

describe('PlusBadge', () => {
  beforeEach(() => rpc.mockReset())

  it('shows the Free badge and opens the sheet', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const user = renderWithClient(<PlusBadge />)
    await user.click(await screen.findByRole('button', { name: 'Versión Free · sin suscripción' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the Plus badge with the end date', async () => {
    rpc.mockResolvedValue({
      data: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      error: null,
    })
    renderWithClient(<PlusBadge />)
    expect(
      await screen.findByRole('button', { name: /^Moni Plus · hasta \d{2}\/\d{2}$/ }),
    ).toBeInTheDocument()
  })

  it('renders nothing until the status is known', async () => {
    let resolve: (value: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((r) => (resolve = r)))
    renderWithClient(<PlusBadge />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    resolve({ data: null, error: null })
    expect(await screen.findByRole('button')).toBeInTheDocument()
  })
})
