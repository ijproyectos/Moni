import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { PlusSubscribe } from './PlusSubscribe'

const invoke = vi.hoisted(() => vi.fn())
const assign = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/useBilling', async (original) => {
  const actual = await original<typeof import('../api/useBilling')>()
  return { ...actual, useStartCheckout: () => actual.useStartCheckout(assign) }
})

const INIT = 'https://www.mercadopago.com.ar/subscriptions/checkout?id=1'

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PlusSubscribe />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

function respond(status: string, extra: Record<string, unknown> = {}) {
  invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
    if (opts.body.action === 'get') return { data: { status }, error: null }
    if (opts.body.action === 'create')
      return { data: { init_point: INIT, status: 'pending' }, error: null }
    return { data: { status: 'authorized' }, error: null, ...extra }
  })
}

describe('PlusSubscribe', () => {
  beforeEach(() => {
    invoke.mockReset()
    assign.mockReset()
  })

  it('offers the subscribe button with the display price and redirects to Mercado Pago', async () => {
    respond('none')
    const user = renderIt()
    const button = await screen.findByRole('button', { name: 'Suscribirme · $2.999/mes' })
    expect(button).toHaveAttribute('data-mp-subscription-cta', 'without-plan-pending')
    await user.click(button)
    expect(invoke).toHaveBeenCalledWith('plus-subscription', { body: { action: 'create' } })
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(INIT))
  })

  it('does not let the person submit twice while preparing', async () => {
    respond('none')
    const user = renderIt()
    const button = await screen.findByRole('button', { name: /Suscribirme/ })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Preparando el pago…' }))
    expect(invoke.mock.calls.filter(([, o]) => o.body.action === 'create')).toHaveLength(1)
  })

  it('shows a friendly error and keeps the button when the server refuses', async () => {
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
      opts.body.action === 'get'
        ? { data: { status: 'none' }, error: null }
        : {
            data: null,
            error: new FunctionsHttpError(
              new Response(JSON.stringify({ error: 'too_many_requests' }), { status: 429 }),
            ),
          },
    )
    const user = renderIt()
    await user.click(await screen.findByRole('button', { name: /Suscribirme/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Esperá un minuto/)
    expect(screen.getByRole('button', { name: /Suscribirme/ })).toBeEnabled()
  })

  it('explains an unfinished payment and lets the person retry (pending)', async () => {
    respond('pending')
    renderIt()
    expect(await screen.findByText(/pago sin completar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })

  it('confirms the renewal and hides the subscribe button (authorized)', async () => {
    respond('authorized')
    renderIt()
    expect(await screen.findByText(/suscripción está activa/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Suscribirme/ })).not.toBeInTheDocument()
  })

  it('offers to reactivate a paused subscription', async () => {
    respond('paused')
    const user = renderIt()
    await user.click(await screen.findByRole('button', { name: 'Reactivar suscripción' }))
    expect(invoke).toHaveBeenCalledWith('plus-subscription', { body: { action: 'reactivate' } })
    expect(screen.queryByRole('button', { name: /Suscribirme/ })).not.toBeInTheDocument()
  })

  it('lets a cancelled subscription subscribe again', async () => {
    respond('cancelled')
    renderIt()
    expect(await screen.findByText(/Cancelaste tu suscripción/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Suscribirme/ })).toBeEnabled()
  })
})
