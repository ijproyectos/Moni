import { findService } from './catalog'
import { usdToArsCents } from './conversion'
import { REFERENCE_PRICES, hasReferencePrices, referencePrice } from './referencePrices'

describe('reference prices', () => {
  it('every entry has a positive finite price, an https source and a check date', () => {
    for (const p of REFERENCE_PRICES) {
      const prices = [p.monthlyUsd, p.yearlyUsd].filter((v) => v !== undefined)
      expect(prices.length, `${p.serviceId}/${p.plan}`).toBeGreaterThan(0)
      for (const v of prices) {
        expect(Number.isFinite(v) && v > 0, `${p.serviceId}/${p.plan}`).toBe(true)
      }
      expect(p.sourceUrl).toMatch(/^https:\/\//)
      expect(p.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('refers to existing catalog services and plans, once each', () => {
    const seen = new Set<string>()
    for (const p of REFERENCE_PRICES) {
      expect(findService(p.serviceId)?.plans, p.serviceId).toContain(p.plan)
      const key = `${p.serviceId}/${p.plan}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('looks up by period and returns nothing for unverified prices', () => {
    expect(referencePrice('claude', 'Pro', 'monthly')?.usd).toBe(20)
    expect(referencePrice('claude', 'Pro', 'yearly')?.usd).toBe(200)
    expect(referencePrice('github-copilot', 'Pro', 'yearly')).toBeUndefined()
    expect(referencePrice('netflix', 'Premium', 'monthly')).toBeUndefined()
    expect(hasReferencePrices('claude')).toBe(true)
    expect(hasReferencePrices('netflix')).toBe(false)
  })
})

describe('usdToArsCents', () => {
  it('converts and rounds to the centavo', () => {
    expect(usdToArsCents(20, 2028)).toBe(40_560_00)
    expect(usdToArsCents(9.99, 1234.567)).toBe(Math.round(9.99 * 1234.567 * 100))
  })
  it('rejects bad input', () => {
    expect(() => usdToArsCents(0, 1000)).toThrow()
    expect(() => usdToArsCents(10, Number.NaN)).toThrow()
  })
})
