import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MpConsentSheet } from './MpConsentSheet'

function setup(props: Partial<React.ComponentProps<typeof MpConsentSheet>> = {}) {
  const onConfirm = vi.fn()
  render(<MpConsentSheet onClose={vi.fn()} onConfirm={onConfirm} {...props} />)
  return { onConfirm, user: userEvent.setup() }
}

const connect = () => screen.getByRole('button', { name: 'Vincular con Mercado Pago' })

describe('MpConsentSheet', () => {
  it('shows the three short points and no data-use details', () => {
    setup()
    expect(screen.getByText(/Nunca guardamos tu usuario/)).toBeInTheDocument()
    expect(screen.queryByText(/Ver detalles/)).toBeNull()
  })

  it('keeps the connect button disabled until the checkbox is ticked', async () => {
    const { user, onConfirm } = setup()
    expect(connect()).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Entiendo y acepto/ }))
    expect(connect()).toBeEnabled()
    await user.click(connect())
    expect(onConfirm).toHaveBeenCalledWith('now')
  })

  it('defaults the window to "from now" and sends the one chosen', async () => {
    const { user, onConfirm } = setup()
    expect(screen.getByRole('button', { name: 'Desde ahora' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Últimos 30 días' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(connect())
    expect(onConfirm).toHaveBeenCalledWith('30')
  })

  it('stays disabled while pending or offline and shows the error', async () => {
    const { user } = setup({ isPending: true, error: 'Algo falló' })
    await user.click(screen.getByRole('checkbox'))
    expect(connect()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló')
  })

  it('is disabled offline with the offline message', async () => {
    const { user } = setup({ offline: true })
    await user.click(screen.getByRole('checkbox'))
    expect(connect()).toBeDisabled()
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
  })
})
