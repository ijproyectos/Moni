import { render } from '@testing-library/react'
import { DestinationGlyph } from './DestinationGlyph'

describe('DestinationGlyph', () => {
  it('follows the destination until the person picks a look', () => {
    const { container, rerender } = render(<DestinationGlyph name="Bariloche" />)
    expect(container.querySelector('[data-destination]')?.getAttribute('data-destination')).toBe('mountain')
    rerender(<DestinationGlyph name="Bariloche" icon="snow" />)
    expect(container.querySelector('[data-destination]')?.getAttribute('data-destination')).toBe('snow')
    rerender(<DestinationGlyph name="Bariloche" icon={null} />)
    expect(container.querySelector('[data-destination]')?.getAttribute('data-destination')).toBe('mountain')
  })
})
