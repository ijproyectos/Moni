import { render, screen } from '@testing-library/react'
import { findBrand } from '../domain/bankCatalog'
import { BrandLogo } from './BrandLogo'

describe('BrandLogo', () => {
  it('shows the local logo, decorative and lazy, when the brand has one', () => {
    const brand = findBrand('visa')
    if (!brand) throw new Error('visa missing')
    const { container } = render(<BrandLogo brand={brand} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toMatch(/visa.*\.svg/)
    expect(img?.getAttribute('src')).not.toMatch(/^https?:/)
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(screen.queryByTestId('brand-initials')).toBeNull()
  })

  it('falls back to colored initials while the official logo is pending', () => {
    const brand = findBrand('galicia')
    if (!brand) throw new Error('galicia missing')
    const { container } = render(<BrandLogo brand={brand} />)
    expect(container.querySelector('img')).toBeNull()
    const avatar = screen.getByTestId('brand-initials')
    expect(avatar).toHaveTextContent('GA')
    expect(avatar).toHaveStyle({ backgroundColor: brand.brandColor })
  })
})
