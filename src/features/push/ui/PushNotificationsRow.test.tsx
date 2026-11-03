import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakePush, type FakePush } from '../api/pushTestEnv'
import { PushNotificationsRow } from './PushNotificationsRow'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

let fake: FakePush | null = null
afterEach(() => {
  fake?.restore()
  fake = null
  vi.unstubAllEnvs()
})
beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('PushNotificationsRow', () => {
  it('renders nothing without a VAPID public key', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    fake = installFakePush({})
    const { container } = render(<PushNotificationsRow />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a button (not a switch) while the permission is undecided, and turns the notices on', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({})
    render(<PushNotificationsRow />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }))
    await waitFor(() =>
      expect(screen.getByText('Siempre activos en este dispositivo')).toBeInTheDocument(),
    )
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything())
  })

  it('shows them as always on, with no control to turn them off, once granted', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({ permission: 'granted', existing: true })
    render(<PushNotificationsRow />)
    await waitFor(() => expect(screen.getByText('Activados')).toBeInTheDocument())
    expect(screen.getByText('Siempre activos en este dispositivo')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains the iPhone install step instead of offering the button', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({ userAgent: IPHONE, standalone: false })
    render(<PushNotificationsRow />)
    expect(screen.getByText(/Agregar a pantalla de inicio/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains how to unblock the notices when the device blocks them', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({ permission: 'denied' })
    render(<PushNotificationsRow />)
    expect(screen.getByText(/Los bloqueaste en este dispositivo/)).toBeInTheDocument()
    expect(screen.getByText(/ajustes del sitio/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains an unsupported browser', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    render(<PushNotificationsRow />)
    expect(screen.getByText('Este navegador no permite recibir avisos.')).toBeInTheDocument()
  })
})
