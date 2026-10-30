import { render } from '@testing-library/react'
import { ServiceLogo } from './ServiceLogo'

describe('ServiceLogo', () => {
  it('shows the local logo lazily, decorative (the name is next to it)', () => {
    const { container } = render(<ServiceLogo serviceId="netflix" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('src')).toMatch(/netflix.*\.svg/)
    expect(img?.getAttribute('src')).not.toMatch(/^https?:/)
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('falls back to a generic icon when the service has no logo', () => {
    const { container } = render(<ServiceLogo serviceId="smart-fit" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('falls back to a generic icon for custom or unknown services', () => {
    const { container } = render(<ServiceLogo serviceId="custom" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
