import { render, screen } from '@testing-library/react'
import { StatusChip } from './StatusChip'

describe('StatusChip', () => {
  it.each([
    ['ok', 'bg-ok-bg', 'text-ok-ink'],
    ['warn', 'bg-warn-bg', 'text-warn-ink'],
    ['bad', 'bg-bad-bg', 'text-bad-ink'],
  ] as const)('the %s variant uses its colors and always shows text', (tone, bg, ink) => {
    render(<StatusChip tone={tone}>Estado</StatusChip>)
    const chip = screen.getByText('Estado')
    expect(chip).toHaveClass(bg, ink)
    expect(chip).toHaveAttribute('data-tone', tone)
  })
})
