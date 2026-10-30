import {
  FREE_BADGE,
  formatPlusExpiry,
  isPlusActive,
  PLUS_PAYMENTS_NOTE,
  plusBadgeText,
} from './plus'

const NOW = new Date('2026-11-06T15:00:00Z')

describe('isPlusActive', () => {
  it('is true only while the end date is in the future', () => {
    expect(isPlusActive('2026-11-30T12:00:00Z', NOW)).toBe(true)
    expect(isPlusActive('2026-11-06T15:00:00Z', NOW)).toBe(false)
    expect(isPlusActive('2026-10-01T00:00:00Z', NOW)).toBe(false)
  })

  it('treats missing or broken dates as Free', () => {
    expect(isPlusActive(null, NOW)).toBe(false)
    expect(isPlusActive(undefined, NOW)).toBe(false)
    expect(isPlusActive('nope', NOW)).toBe(false)
  })
})

describe('formatPlusExpiry', () => {
  it('prints DD/MM in Argentina time', () => {
    expect(formatPlusExpiry('2026-11-30T12:00:00Z')).toBe('30/11')
    expect(formatPlusExpiry('2026-11-30T12:00:00Z', true)).toBe('30/11/2026')
  })

  it('uses the Argentina day, not the UTC one, near midnight', () => {
    // 01:30 UTC on Dec 1st is still Nov 30th at 22:30 in Buenos Aires.
    expect(formatPlusExpiry('2026-12-01T01:30:00Z')).toBe('30/11')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatPlusExpiry('nope')).toBe('')
  })
})

describe('plusBadgeText', () => {
  it('shows the Free badge without a subscription', () => {
    expect(plusBadgeText(null, NOW)).toBe(FREE_BADGE)
    expect(plusBadgeText('2026-10-01T00:00:00Z', NOW)).toBe('Versión Free · sin suscripción')
  })

  it('shows the end date while Plus is active', () => {
    expect(plusBadgeText('2026-11-30T12:00:00Z', NOW)).toBe('Moni Plus · hasta 30/11')
  })
})

describe('upsell copy', () => {
  it('is honest that payments are not available yet', () => {
    expect(PLUS_PAYMENTS_NOTE).toMatch(/Todavía no se puede pagar/)
  })
})
