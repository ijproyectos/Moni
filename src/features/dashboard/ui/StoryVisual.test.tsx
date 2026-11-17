import { render, screen } from '@testing-library/react'
import { StoryVisual } from './StoryVisual'

describe('StoryVisual', () => {
  it('progress: a bar with the real percentage and its caption', () => {
    render(<StoryVisual visual={{ kind: 'progress', value: 0.4, caption: '$40.000 de $100.000' }} accent="#fff" />)
    expect(screen.getByRole('progressbar', { name: '$40.000 de $100.000' })).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('bars: one row per item with its amount and a width relative to the biggest', () => {
    const { container } = render(
      <StoryVisual
        visual={{ kind: 'bars', rows: [{ label: 'Ana', share: 1, amount: '$10.000' }, { label: 'Caro', share: 0.5, amount: '$5.000' }] }}
        accent="#fff"
      />,
    )
    expect(screen.getByText('$10.000')).toBeInTheDocument()
    expect(screen.getByText('Caro')).toBeInTheDocument()
    const widths = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span')).map((e) => e.style.width)
    expect(widths).toEqual(['100%', '50%'])
  })

  it('badge: shows the name of the badge earned', () => {
    render(<StoryVisual visual={{ kind: 'badge', name: 'Constante' }} accent="#fff" />)
    expect(screen.getByText('Constante')).toBeInTheDocument()
  })
})
