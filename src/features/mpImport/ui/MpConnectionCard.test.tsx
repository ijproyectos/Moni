import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MpConnection } from '../domain/mpImport'
import { MpConnectionCard } from './MpConnectionCard'

const conn = (over: Partial<MpConnection> = {}): MpConnection => ({
  status: 'active',
  lastSyncAt: '2026-11-02T13:00:00Z',
  lastErrorClass: null,
  importSince: '2026-11-01T00:00:00Z',
  ...over,
})

function setup(props: Partial<React.ComponentProps<typeof MpConnectionCard>> = {}) {
  const handlers = {
    onConnect: vi.fn(),
    onSync: vi.fn(),
    onUnlink: vi.fn(),
    onUpgrade: vi.fn(),
  }
  render(
    <MpConnectionCard
      connection={null}
      isPlus
      isFree={false}
      offline={false}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('MpConnectionCard', () => {
  it('Plus without a connection offers to link', async () => {
    const { user, onConnect } = setup()
    await user.click(screen.getByRole('button', { name: 'Vincular Mercado Pago' }))
    expect(onConnect).toHaveBeenCalled()
  })

  it('Free users see the upsell, not a connect button', async () => {
    const { user, onUpgrade } = setup({ isPlus: false, isFree: true })
    expect(screen.queryByRole('button', { name: 'Vincular Mercado Pago' })).toBeNull()
    expect(screen.getByText(/aparecen solos como gastos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Conocer Moni Plus' }))
    expect(onUpgrade).toHaveBeenCalled()
  })

  it('renders nothing while the plan is unknown and there is no connection', () => {
    setup({ isPlus: false, isFree: false })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('an unlinked connection behaves like none', () => {
    setup({ connection: conn({ status: 'unlinked' }) })
    expect(screen.getByRole('button', { name: 'Vincular Mercado Pago' })).toBeInTheDocument()
  })

  it('active: shows status, last sync and the two actions', async () => {
    const { user, onSync, onUnlink } = setup({ connection: conn() })
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText(/02\/11 10:00/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sincronizar ahora' }))
    await user.click(screen.getByRole('button', { name: 'Desvincular' }))
    expect(onSync).toHaveBeenCalled()
    expect(onUnlink).toHaveBeenCalled()
  })

  it('active but never synced says so, and shows the last error class text', () => {
    setup({ connection: conn({ lastSyncAt: null, lastErrorClass: 'mp_unavailable' }) })
    expect(screen.getByText(/Todavía no sincronizó/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Mercado Pago no respondió/)
  })

  it('tells the person how many payments could not be imported', () => {
    setup({ connection: conn(), unimportedCount: 2 })
    expect(screen.getByText(/No pudimos cargar 2 pagos de Mercado Pago/)).toBeInTheDocument()
  })

  it('shows no unimported notice when the count is zero', () => {
    setup({ connection: conn(), unimportedCount: 0 })
    expect(screen.queryByText(/No pudimos cargar/)).toBeNull()
  })

  it('needs_reconnect: reconnect prompt, no sync button, unlink still there', async () => {
    const { user, onConnect } = setup({ connection: conn({ status: 'needs_reconnect' }) })
    expect(screen.queryByRole('button', { name: 'Sincronizar ahora' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Volver a vincular' }))
    expect(onConnect).toHaveBeenCalled()
  })

  it('plus_lapsed: paused with upsell, movements kept, unlink allowed', async () => {
    const { user, onUpgrade } = setup({
      connection: conn({ status: 'plus_lapsed' }),
      isPlus: false,
      isFree: true,
    })
    expect(screen.getByText(/en pausa/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sincronizar ahora' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Reactivar con Moni Plus' }))
    expect(onUpgrade).toHaveBeenCalled()
  })

  it('offline disables sync now, unlink and connect', () => {
    setup({ connection: conn(), offline: true })
    expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeDisabled()
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
  })

  it('offline disables linking and reconnecting', () => {
    setup({ offline: true })
    expect(screen.getByRole('button', { name: 'Vincular Mercado Pago' })).toBeDisabled()
  })

  it('busy actions are disabled and relabelled', () => {
    setup({ connection: conn(), busy: 'sync' })
    expect(screen.getByRole('button', { name: 'Sincronizando…' })).toBeDisabled()
  })
})
