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

  it('shows the toggle and turns the notices on from a tap', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({})
    render(<PushNotificationsRow />)
    const toggle = screen.getByRole('switch', { name: 'Avisos de Moni' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText('Activados en este dispositivo')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', expect.anything())
  })

  it('explains the iPhone install step instead of offering the toggle', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({ userAgent: IPHONE, standalone: false })
    render(<PushNotificationsRow />)
    expect(screen.getByText(/Agregar a pantalla de inicio/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('explains a blocked permission', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    fake = installFakePush({ permission: 'denied' })
    render(<PushNotificationsRow />)
    expect(screen.getByText(/Los bloqueaste en el navegador/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('explains an unsupported browser', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'SGk')
    render(<PushNotificationsRow />)
    expect(screen.getByText('Este navegador no permite recibir avisos.')).toBeInTheDocument()
  })
})
