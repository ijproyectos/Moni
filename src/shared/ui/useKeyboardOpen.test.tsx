import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useKeyboardOpen } from './useKeyboardOpen'

function Probe() {
  const open = useKeyboardOpen()
  return (
    <div>
      <p>{open ? 'teclado' : 'sin teclado'}</p>
      <input aria-label="uno" />
      <input aria-label="dos" />
      <input type="checkbox" aria-label="marca" />
      <button type="button">boton</button>
    </div>
  )
}

describe('useKeyboardOpen', () => {
  it('is on while a text field has focus and off when focus leaves', async () => {
    const user = userEvent.setup()
    render(<Probe />)
    expect(screen.getByText('sin teclado')).toBeInTheDocument()
    await user.click(screen.getByLabelText('uno'))
    expect(screen.getByText('teclado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'boton' }))
    expect(screen.getByText('sin teclado')).toBeInTheDocument()
  })

  it('stays on when moving from one text field to another', async () => {
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByLabelText('uno'))
    await user.tab()
    expect(screen.getByLabelText('dos')).toHaveFocus()
    expect(screen.getByText('teclado')).toBeInTheDocument()
  })

  it('a checkbox does not raise a keyboard', async () => {
    render(<Probe />)
    act(() => screen.getByLabelText('marca').focus())
    expect(screen.getByText('sin teclado')).toBeInTheDocument()
  })
})
