import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwipeRow } from './SwipeRow'

function setup() {
  const onVoid = vi.fn()
  const onEdit = vi.fn()
  const onPress = vi.fn()
  render(
    <SwipeRow
      onPress={onPress}
      leadingAction={{ label: 'Anular', tone: 'danger', ariaLabel: 'Anular Cena', onPress: onVoid }}
      actions={[{ label: 'Editar', tone: 'primary', ariaLabel: 'Editar Cena', onPress: onEdit }]}
    >
      <span>Cena</span>
    </SwipeRow>,
  )
  const row = screen.getByText('Cena').closest('button')?.parentElement as HTMLElement
  const swipe = (from: number, to: number) => {
    fireEvent.pointerDown(row, { clientX: from, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(row, { clientX: to, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(row, { clientX: to, clientY: 10, pointerId: 1 })
  }
  return { row, swipe, onVoid, onEdit, onPress }
}

describe('SwipeRow in both directions', () => {
  it('swiping right opens the leading action (void) and swiping left the trailing ones (edit)', () => {
    const { row, swipe } = setup()
    expect(row.style.transform).toBe('translateX(0px)')
    swipe(100, 190)
    expect(row.style.transform).toBe('translateX(76px)')
    swipe(190, 100)
    expect(row.style.transform).toBe('translateX(0px)')
    swipe(200, 100)
    expect(row.style.transform).toBe('translateX(-76px)')
  })

  it('never opens past its actions, and a vertical move does not swipe', () => {
    const { row, swipe } = setup()
    swipe(0, 300)
    expect(row.style.transform).toBe('translateX(76px)')
    swipe(300, 0)
    swipe(300, 0)
    expect(row.style.transform).toBe('translateX(-76px)')
    fireEvent.pointerDown(row, { clientX: 100, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(row, { clientX: 104, clientY: 90, pointerId: 1 })
    fireEvent.pointerUp(row, { clientX: 104, clientY: 90, pointerId: 1 })
    expect(row.style.transform).toBe('translateX(-76px)')
  })

  it('the actions are real buttons: the keyboard reaches them and pressing runs them', async () => {
    const { onVoid, onEdit } = setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Anular Cena' }))
    expect(onVoid).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Editar Cena' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('focusing an action opens its side', async () => {
    const { row } = setup()
    act(() => screen.getByRole('button', { name: 'Anular Cena' }).focus())
    expect(row.style.transform).toBe('translateX(76px)')
    act(() => screen.getByRole('button', { name: 'Editar Cena' }).focus())
    expect(row.style.transform).toBe('translateX(-76px)')
  })

  it('without a leading action it only swipes left', () => {
    render(
      <SwipeRow actions={[{ label: 'Editar', tone: 'primary', onPress: vi.fn() }]}>
        <span>Fila</span>
      </SwipeRow>,
    )
    const row = screen.getByText('Fila').parentElement as HTMLElement
    fireEvent.pointerDown(row, { clientX: 100, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(row, { clientX: 200, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(row, { clientX: 200, clientY: 10, pointerId: 1 })
    expect(row.style.transform).toBe('translateX(0px)')
  })
})
