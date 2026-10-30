import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Camera, Mic, Plus } from 'lucide-react'
import { AddActionMenu } from './AddActionMenu'
import { MoniAddButton } from './MoniAddButton'

function setup() {
  const onClose = vi.fn()
  const onPhoto = vi.fn()
  const onVoice = vi.fn()
  const onManual = vi.fn()
  render(
    <AddActionMenu
      onClose={onClose}
      actions={[
        { id: 'photo', label: 'Sacar foto', icon: Camera, circle: 'bg-lime', onSelect: onPhoto },
        { id: 'voice', label: 'Por voz', icon: Mic, circle: 'bg-expense', onSelect: onVoice },
        { id: 'manual', label: 'Manual', icon: Plus, circle: 'bg-forest', onSelect: onManual },
      ]}
    />,
  )
  return { onClose, onPhoto, onVoice, onManual, user: userEvent.setup() }
}

describe('AddActionMenu', () => {
  it('shows the three options side by side, each with its name', () => {
    setup()
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Sacar foto',
      'Por voz',
      'Manual',
    ])
  })

  it('each option runs its own action', async () => {
    const { user, onPhoto, onVoice, onManual } = setup()
    await user.click(screen.getByRole('menuitem', { name: 'Por voz' }))
    await user.click(screen.getByRole('menuitem', { name: 'Manual' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sacar foto' }))
    expect(onVoice).toHaveBeenCalledTimes(1)
    expect(onManual).toHaveBeenCalledTimes(1)
    expect(onPhoto).toHaveBeenCalledTimes(1)
  })

  it('focuses the first option and closes with Escape', async () => {
    const { user, onClose } = setup()
    expect(screen.getByRole('menuitem', { name: 'Sacar foto' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('MoniAddButton', () => {
  it('is the cat itself (no plus or cross) and announces the menu and its state', () => {
    const { rerender } = render(<MoniAddButton aria-label="Agregar movimiento" />)
    const button = screen.getByRole('button', { name: 'Agregar movimiento' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    // Nothing moves until it is touched.
    expect(button.querySelector('svg')).not.toHaveAttribute('data-phase')

    rerender(<MoniAddButton aria-label="Agregar movimiento" open />)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button.querySelector('svg')).toHaveAttribute('data-phase', 'open')

    rerender(<MoniAddButton aria-label="Agregar movimiento" />)
    expect(button.querySelector('svg')).toHaveAttribute('data-phase', 'close')
  })
})
