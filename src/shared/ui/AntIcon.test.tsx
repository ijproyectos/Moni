import { render } from '@testing-library/react'
import { AntIcon } from './AntIcon'

describe('AntIcon', () => {
  it('is a solid icon that takes its size and color from where it is used', () => {
    const { container } = render(<AntIcon aria-hidden="true" className="size-5" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveClass('lucide-ant', 'size-5')
    // A single silhouette filled with the current text color, mirrored to face right.
    const paths = svg?.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths?.[0]).toHaveAttribute('fill', 'currentColor')
    expect(paths?.[0]).toHaveAttribute('stroke', 'none')
    expect(paths?.[0]?.getAttribute('transform')).toMatch(/^matrix\(-/)
  })
})
