import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { MpImportSection } from './MpImportSection'

const repo = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getDuplicates: vi.fn(),
  getSubscriptionSuggestions: vi.fn(),
  getUnimportedCount: vi.fn(),
  finishPendingLink: vi.fn(),
  connectMp: vi.fn(),
  unlinkMp: vi.fn(),
  syncNow: vi.fn(),
  dismissDuplicate: vi.fn(),
}))
const plus = vi.hoisted(() => ({ value: { isPlus: true, isFree: false } }))
vi.mock('../api/mpImportRepository', async (original) => ({
  ...(await original<typeof import('../api/mpImportRepository')>()),
  ...repo,
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => plus.value }))
vi.mock('@/features/plus/ui/PlusSheet', () => ({
  PlusSheet: () => <div role="dialog" aria-label="plus-sheet" />,
}))

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

function renderSection(url = '/cuentas') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ToastProvider>
          <MpImportSection />
          <Where />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const active = {
  status: 'active',
  lastSyncAt: '2026-11-02T13:00:00Z',
  lastErrorClass: null,
  importSince: '',
}

describe('MpImportSection', () => {
  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset())
    repo.getConnection.mockResolvedValue(null)
    repo.getDuplicates.mockResolvedValue([])
    repo.getSubscriptionSuggestions.mockResolvedValue([])
    repo.getUnimportedCount.mockResolvedValue(0)
    repo.finishPendingLink.mockResolvedValue(false)
    plus.value = { isPlus: true, isFree: false }
  })
  afterEach(() => onlineManager.setOnline(true))

  it('free user sees the upsell and the Plus sheet, never a broken connect button', async () => {
    plus.value = { isPlus: false, isFree: true }
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Conocer Moni Plus' }))
    expect(screen.getByRole('dialog', { name: 'plus-sheet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vincular Mercado Pago' })).toBeNull()
    expect(repo.connectMp).not.toHaveBeenCalled()
  })

  it('link flow: consent sheet then connect with the chosen window and redirect', async () => {
    repo.connectMp.mockResolvedValue('https://auth.mercadopago.com.ar/authorization?x=1')
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location)
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Vincular Mercado Pago' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Vincular con Mercado Pago' }))
    await waitFor(() => expect(repo.connectMp).toHaveBeenCalledWith('now'))
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://auth.mercadopago.com.ar/authorization?x=1'),
    )
    vi.restoreAllMocks()
  })

  it('shows a server refusal inside the consent sheet', async () => {
    const { MpImportError } = await import('../api/mpImportRepository')
    repo.connectMp.mockRejectedValue(new MpImportError('rate_limited'))
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Vincular Mercado Pago' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Vincular con Mercado Pago' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/unos minutos/)
  })

  it('sync now calls the server; unlink asks for confirmation first', async () => {
    repo.getConnection.mockResolvedValue(active)
    repo.syncNow.mockResolvedValue(undefined)
    repo.unlinkMp.mockResolvedValue(undefined)
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Sincronizar ahora' }))
    await waitFor(() => expect(repo.syncNow).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Desvincular' }))
    expect(repo.unlinkMp).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sí, desvincular' }))
    await waitFor(() => expect(repo.unlinkMp).toHaveBeenCalled())
  })

  it('disables sync now and unlink while offline', async () => {
    repo.getConnection.mockResolvedValue(active)
    renderSection()
    expect(await screen.findByRole('button', { name: 'Sincronizar ahora' })).toBeEnabled()
    act(() => onlineManager.setOnline(false))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeDisabled()
  })

  it('shows duplicates and subscription suggestions only when linked, and dismisses via the RPC', async () => {
    repo.getConnection.mockResolvedValue(active)
    repo.getDuplicates.mockResolvedValue([
      {
        paymentId: 'p1',
        occurredOn: '2026-05-10',
        duplicateOccurredOn: '2026-05-11',
        cents: 80000,
      },
    ])
    repo.getSubscriptionSuggestions.mockResolvedValue([
      {
        paymentId: 'p9',
        merchant: 'NETFLIX',
        occurredOn: '2026-03-10',
        cents: 500000,
        subscriptionName: 'Netflix',
      },
    ])
    repo.dismissDuplicate.mockResolvedValue(undefined)
    const user = renderSection()
    expect(await screen.findByText(/Netflix/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /No es duplicado/ }))
    await waitFor(() => expect(repo.dismissDuplicate.mock.calls[0]?.[0]).toBe('p1'))
  })

  it('does not fetch duplicates or suggestions without a connection', async () => {
    renderSection()
    await screen.findByRole('button', { name: 'Vincular Mercado Pago' })
    expect(repo.getDuplicates).not.toHaveBeenCalled()
    expect(repo.getSubscriptionSuggestions).not.toHaveBeenCalled()
  })

  it('reads ?mp=ok, announces it and cleans the URL keeping other params', async () => {
    renderSection('/cuentas?mp=ok&tab=tarjetas')
    expect(await screen.findByText(/Mercado Pago vinculado/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/cuentas?tab=tarjetas'),
    )
  })

  it('reads ?mp=error&reason=denied, shows the reason and cleans the URL', async () => {
    renderSection('/cuentas?mp=error&reason=denied')
    expect(await screen.findByText(/No diste permiso/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/cuentas$/))
  })

  it('?mp=pending finishes the exchange with the app session, announces success and cleans the URL', async () => {
    repo.finishPendingLink.mockResolvedValue(true)
    renderSection('/cuentas?mp=pending&tab=tarjetas')
    expect(await screen.findByText(/Mercado Pago vinculado/)).toBeInTheDocument()
    expect(repo.finishPendingLink).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/cuentas?tab=tarjetas'),
    )
  })

  it('?mp=pending with a server refusal shows the mapped reason', async () => {
    const { MpImportError } = await import('../api/mpImportRepository')
    repo.finishPendingLink.mockRejectedValue(new MpImportError('invalid_state'))
    renderSection('/cuentas?mp=pending')
    expect(await screen.findByText(/venció o ya se usó/)).toBeInTheDocument()
  })

  it('?mp=pending with nothing parked asks the person to link again', async () => {
    repo.finishPendingLink.mockResolvedValue(false)
    renderSection('/cuentas?mp=pending')
    expect(await screen.findByText(/Abrí Moni en este mismo navegador/)).toBeInTheDocument()
  })
})
