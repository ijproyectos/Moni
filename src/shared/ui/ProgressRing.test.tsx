import { render, screen } from '@testing-library/react'
import { ProgressRing } from './ProgressRing'

describe('ProgressRing', () => {
  it('draws the share of the circle and shows its label', () => {
    render(<ProgressRing value={0.25} label="25%" />)
    expect(screen.getByText('25%')).toBeInTheDocument()
    const arc = screen.getByTestId('ring-arc')
    const circumference = 2 * Math.PI * ((64 - 7) / 2)
    const [filled, total] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)
    expect(total).toBeCloseTo(circumference)
    expect(filled).toBeCloseTo(circumference / 4)
  })

  it('never goes past a full turn nor below empty', () => {
    const { rerender } = render(<ProgressRing value={3} label="100%" />)
    const full = screen.getByTestId('ring-arc').getAttribute('stroke-dasharray')?.split(' ')
    expect(Number(full?.[0])).toBeCloseTo(Number(full?.[1]))
    rerender(<ProgressRing value={-1} label="0%" />)
    expect(screen.getByTestId('ring-arc').getAttribute('stroke-dasharray')).toMatch(/^0 /)
  })
})
