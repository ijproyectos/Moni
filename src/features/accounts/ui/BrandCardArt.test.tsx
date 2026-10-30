import { render, screen } from '@testing-library/react'
import { BANK_CATALOG } from '../domain/bankCatalog'
import { CARD_SKINS, skinForBrandId } from '../domain/cardSkins'
import { BrandBadge, BrandCardArt } from './BrandCardArt'

describe('BrandCardArt', () => {
  it.each(CARD_SKINS.map((s) => [s.id, s] as const))(
    '%s draws its illustration, hidden from screen readers',
    (_id, skin) => {
      const { container } = render(<BrandCardArt skin={skin} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('data-art', skin.art)
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg?.children.length).toBeGreaterThan(0)
    },
  )
})

describe('BrandBadge', () => {
  it('uses the official logo on a chip when the project has the file', () => {
    const brand = BANK_CATALOG.find((b) => b.id === 'mercado-pago')
    const skin = skinForBrandId('mercado-pago')
    if (!brand || !skin) throw new Error('missing fixtures')
    const { container } = render(<BrandBadge brand={brand} skin={skin} />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(screen.queryByTestId('brand-badge')).toBeNull()
  })

  it('otherwise shows the emblem of the entity in the colors of its card', () => {
    const brand = BANK_CATALOG.find((b) => b.id === 'bbva')
    const skin = skinForBrandId('bbva')
    if (!brand || !skin) throw new Error('missing fixtures')
    render(<BrandBadge brand={brand} skin={skin} />)
    const badge = screen.getByTestId('brand-badge')
    expect(badge).toHaveTextContent('BBVA')
    expect(badge).toHaveStyle({ color: skin.ink })
  })

  it('uses a drawn glyph where the identity has one (Santander, Lemon, ICBC, Naranja X)', () => {
    for (const id of ['santander', 'lemon', 'icbc', 'naranja-x']) {
      const brand = BANK_CATALOG.find((b) => b.id === id)
      const skin = skinForBrandId(id)
      if (!brand || !skin) throw new Error('missing fixtures')
      const { container, unmount } = render(<BrandBadge brand={brand} skin={skin} />)
      expect(container.querySelector('[data-testid="brand-badge"] svg')).not.toBeNull()
      unmount()
    }
  })
})
