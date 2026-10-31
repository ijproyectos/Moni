import { render, screen } from '@testing-library/react'
import { PlusPill } from './PlusPill'

describe('PlusPill', () => {
  it('shows the yellow "✦ PLUS" badge of the Home avatar', () => {
    render(<PlusPill />)
    const pill = screen.getByText('✦ PLUS')
    expect(pill).toHaveClass('bg-gold')
    expect(pill).toHaveAttribute('title', 'Moni Plus activo')
  })

  it('accepts extra classes for each place it is used in', () => {
    render(<PlusPill className="mt-1" />)
    expect(screen.getByText('✦ PLUS')).toHaveClass('mt-1', 'bg-gold')
  })
})
