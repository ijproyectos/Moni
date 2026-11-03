import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { installFakePush, type FakePush } from '../api/pushTestEnv'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

let fake: FakePush | null = null

// The "closed for this session" flag lives in the module: load a fresh copy per test, like a new app start.
async function renderPrompt(path = '/') {
  vi.resetModules()
  const { PushEnrollmentPrompt } = await import('./PushEnrollmentPrompt')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PushEnrollmentPrompt />
    </MemoryRouter>,
  )
}

afterEach(() => {
  fake?.restore()
  fake = null
  vi.unstubAllEnvs()
})
beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
})

describe('PushEnrollmentPrompt', () => {
  it('asks to activate the notices while the permission is undecided, on Inicio', async () => {
    fake = installFakePush({})
    await renderPrompt()
    expect(screen.getByText('Activá los avisos de Moni')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))
    await waitFor(() =>
      expect(screen.queryByText('Activá los avisos de Moni')).not.toBeInTheDocument(),
    )
    expect(fake.requestPermission).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything())
  })

  it('only shows on Inicio', async () => {
    fake = installFakePush({})
    await renderPrompt('/actividad')
    expect(screen.queryByText('Activá los avisos de Moni')).not.toBeInTheDocument()
  })

  it('closing it hides it for this session only and offers no "never again"', async () => {
    fake = installFakePush({})
    await renderPrompt()
    expect(screen.queryByText(/no volver a mostrar|nunca más/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByText('Activá los avisos de Moni')).not.toBeInTheDocument()
    // A new app start (fresh module state) asks again.
    const again = await renderPrompt()
    expect(again.getByText('Activá los avisos de Moni')).toBeInTheDocument()
  })

  it('does not ask when the permission is already granted: it subscribes silently instead', async () => {
    fake = installFakePush({ permission: 'granted' })
    await renderPrompt()
    expect(screen.queryByText('Activá los avisos de Moni')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything()),
    )
    expect(fake.requestPermission).not.toHaveBeenCalled()
  })

  it('stays quiet when the device blocks notifications (the profile row explains it)', async () => {
    fake = installFakePush({ permission: 'denied' })
    await renderPrompt()
    expect(screen.queryByRole('region', { name: 'Avisos de Moni' })).not.toBeInTheDocument()
  })

  it('shows the install guide on an iPhone outside the installed app', async () => {
    fake = installFakePush({ userAgent: IPHONE, standalone: false })
    await renderPrompt()
    expect(screen.getByText('Instalá Moni para recibir avisos')).toBeInTheDocument()
    expect(screen.getByText(/Agregar a pantalla de inicio/)).toBeInTheDocument()
  })

  it('renders nothing without a VAPID public key', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    fake = installFakePush({})
    const view = await renderPrompt()
    expect(view.container).toBeEmptyDOMElement()
  })
})
