import { render, screen } from '@testing-library/react'
import { Kicker } from './Kicker'

describe('Kicker', () => {
  it('renders the label with the uppercase, spaced style', () => {
    render(<Kicker>Hoy podés gastar</Kicker>)
    expect(screen.getByText('Hoy podés gastar')).toHaveClass('uppercase', 'font-semibold', 'tracking-[0.12em]')
  })

  it('can render as another element and merge classes', () => {
    render(
      <Kicker as="span" className="mt-2">
        Resumen
      </Kicker>,
    )
    const el = screen.getByText('Resumen')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveClass('mt-2')
  })
})
