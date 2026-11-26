import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteAccountError } from '../api/deleteAccount'
import { DELETE_ACCOUNT_TEXT, DELETE_ACCOUNT_TITLE, DeleteAccountDialog } from './DeleteAccountDialog'

const api = vi.hoisted(() => ({ deleteAccount: vi.fn(), mp: null as unknown }))
vi.mock('@/features/mpImport/api/useMpImport', () => ({ useMpConnection: () => ({ data: api.mp }) }))
vi.mock('../api/deleteAccount', async (original) => ({
  ...(await original<typeof import('../api/deleteAccount')>()),
  deleteAccount: api.deleteAccount,
}))

function setup() {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(<DeleteAccountDialog onClose={onClose} onDeleted={onDeleted} />)
  return { onClose, onDeleted, user: userEvent.setup() }
}

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    api.deleteAccount.mockReset()
    api.mp = null
  })

  it('asks with Moni, the exact title and text, and the two buttons', () => {
    setup()
    const dialog = screen.getByRole('alertdialog', { name: '¿Seguro que querés eliminar tu cuenta?' })
    expect(DELETE_ACCOUNT_TITLE).toBe('¿Seguro que querés eliminar tu cuenta?')
    expect(dialog).toHaveTextContent(DELETE_ACCOUNT_TEXT)
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer')
    expect(dialog.querySelector('img')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Conservar mi cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar mi cuenta' })).toHaveClass('bg-expense')
  })

  it('"Conservar mi cuenta" closes and deletes nothing', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Conservar mi cuenta' }))
    expect(onClose).toHaveBeenCalled()
    expect(api.deleteAccount).not.toHaveBeenCalled()
  })

  it('"Eliminar mi cuenta" is not enough: it asks to type ELIMINAR and only that exact word enables the final button', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(api.deleteAccount).not.toHaveBeenCalled()
    const box = screen.getByRole('textbox', { name: /Escribí ELIMINAR/ })
    const final = screen.getByRole('button', { name: 'Eliminar mi cuenta' })
    expect(final).toBeDisabled()
    await user.type(box, 'eliminar')
    expect(final).toBeDisabled()
    await user.clear(box)
    await user.type(box, 'ELIMINAR')
    expect(final).toBeEnabled()
  })

  it('on success (the server finished) it reports it once; the final button sends the word', async () => {
    api.deleteAccount.mockResolvedValue(undefined)
    const { user, onDeleted } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await user.type(screen.getByRole('textbox', { name: /Escribí ELIMINAR/ }), 'ELIMINAR')
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.deleteAccount).toHaveBeenCalledWith('ELIMINAR')
  })

  it('on failure it never reports success: it shows why, stays open and can be retried', async () => {
    api.deleteAccount.mockRejectedValueOnce(new DeleteAccountError('subscription_cancel_failed'))
    const { user, onDeleted } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await user.type(screen.getByRole('textbox', { name: /Escribí ELIMINAR/ }), 'ELIMINAR')
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no eliminamos nada')
    expect(onDeleted).not.toHaveBeenCalled()
    api.deleteAccount.mockResolvedValueOnce(undefined)
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('while it is deleting nothing can dismiss the dialog', async () => {
    let finish: () => void = () => undefined
    api.deleteAccount.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await user.type(screen.getByRole('textbox', { name: /Escribí ELIMINAR/ }), 'ELIMINAR')
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(screen.getByRole('button', { name: 'Eliminando tu cuenta…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    finish()
  })

  it('with Mercado Pago linked it says the link is deleted and how to remove the permission there too', async () => {
    api.mp = { status: 'active' }
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Aplicaciones conectadas')
  })

  it('without Mercado Pago there is no such note', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('Aplicaciones conectadas')
  })
})
