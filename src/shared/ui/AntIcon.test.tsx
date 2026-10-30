import { render } from '@testing-library/react'
import { AntIcon } from './AntIcon'

describe('AntIcon', () => {
  it('is a regular line icon that takes its size and color from where it is used', () => {
    const { container } = render(
      <AntIcon aria-hidden="true" className="size-6" strokeWidth={2.25} />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-width', '2.25')
    // Head, thorax and abdomen, six legs and two antennae.
    expect(svg?.querySelectorAll('circle, ellipse')).toHaveLength(3)
    expect(svg?.querySelectorAll('path')).toHaveLength(8)
  })
})
