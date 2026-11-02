import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddPersonSheet } from './AddPersonSheet'

function renderSheet(onAddGuest: () => unknown = vi.fn(), onClose = vi.fn()) {
  render(
    <AddPersonSheet code="ABC123" groupName="Viaje" onClose={onClose} onAddGuest={onAddGuest} />,
  )
  return userEvent.setup()
}

describe('AddPersonSheet', () => {
  it('offers the two ways in: invite with a code, or add by name', () => {
    renderSheet()
    expect(screen.getByText('Invitar con código')).toBeInTheDocument()
    expect(screen.getByText('Agregar por nombre')).toBeInTheDocument()
  })

  it('adds by name only: no email, phone or account is asked for', async () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    const user = renderSheet(onAdd, onClose)
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    expect(screen.queryByLabelText(/correo|email|teléfono|celular/i)).toBeNull()
    const submit = screen.getByRole('button', { name: /Sumar a/ })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Nombre'), 'Fran')
    await user.click(screen.getByRole('button', { name: 'Sumar a Fran' }))
    expect(onAdd).toHaveBeenCalledWith('Fran', '')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when the person could not be saved', async () => {
    const onClose = vi.fn()
    const user = renderSheet(() => Promise.resolve(false), onClose)
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Fran')
    await user.click(screen.getByRole('button', { name: 'Sumar a Fran' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
