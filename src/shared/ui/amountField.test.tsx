import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AmountInput } from './AmountInput'

function Controlled({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <AmountInput aria-label="Monto" value={value} onChange={(e) => setValue(e.target.value)} />
      <output data-testid="state">{value}</output>
    </>
  )
}

function setup(initial?: string) {
  render(<Controlled initial={initial} />)
  return { user: userEvent.setup(), box: screen.getByLabelText('Monto') as HTMLInputElement }
}

describe('amount field formatting while typing', () => {
  it('groups digits as they are typed and reports the formatted value', async () => {
    const { user, box } = setup()
    await user.type(box, '1234567')
    expect(box.value).toBe('1.234.567')
    expect(screen.getByTestId('state')).toHaveTextContent('1.234.567')
  })

  it('keeps decimals after a comma, capped at two digits', async () => {
    const { user, box } = setup()
    await user.type(box, '1234567,5')
    expect(box.value).toBe('1.234.567,5')
    await user.type(box, '55')
    expect(box.value).toBe('1.234.567,55')
  })

  it('treats a typed dot as a decimal comma when there is no comma yet', async () => {
    const { user, box } = setup()
    await user.type(box, '12.5')
    expect(box.value).toBe('12,5')
  })

  // Some phone keyboards report the insertion without saying which character it was (`data: null`). The typed
  // dot must still become a decimal comma: dropping it would turn "12.5" into 125 (ten times too much).
  it('reads the typed character from the text when the keyboard sends no `data`', () => {
    const { box } = setup()
    const type = (value: string) =>
      fireEvent.input(box, { target: { value }, inputType: 'insertText', data: null })
    type('1')
    type('12')
    type('12.')
    expect(box.value).toBe('12,')
    type('12,5')
    expect(box.value).toBe('12,5')
  })

  it('still accepts a full es-AR amount typed key by key', async () => {
    const { user, box } = setup()
    await user.type(box, '6.250,50')
    expect(box.value).toBe('6.250,50')
    await user.clear(box)
    await user.type(box, '1.234.567')
    expect(box.value).toBe('1.234.567')
  })

  it('normalises a pasted amount', async () => {
    const { user, box } = setup()
    await user.click(box)
    await user.paste('1.234,50')
    expect(box.value).toBe('1.234,50')
    await user.clear(box)
    await user.paste('$ 12.5')
    expect(box.value).toBe('12,50')
  })

  it('strips dots when deleting and regroups', async () => {
    const { user, box } = setup('1.234.567')
    await user.type(box, '{Backspace}')
    expect(box.value).toBe('123.456')
  })

  it('backspace right after a separator removes the digit before it', async () => {
    const { user, box } = setup('1.234')
    box.focus()
    box.setSelectionRange(2, 2)
    await user.keyboard('{Backspace}')
    expect(box.value).toBe('234')
  })

  it('keeps the caret in place when typing in the middle', async () => {
    const { user, box } = setup('1.234')
    box.focus()
    box.setSelectionRange(1, 1)
    await user.keyboard('9')
    expect(box.value).toBe('19.234')
    expect(box.selectionStart).toBe(2)
  })

  it('shows an initial formatted value untouched', () => {
    const { box } = setup('1.234,50')
    expect(box.value).toBe('1.234,50')
  })

  it('handles programmatic changes without a native input type', () => {
    const { box } = setup()
    fireEvent.change(box, { target: { value: '12.5' } })
    expect(box.value).toBe('12,50')
  })
})
