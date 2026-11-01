import { describe, expect, it } from 'vitest'
import {
  INACTIVITY_LIMIT_MS,
  clearLastActivity,
  isExpired,
  msUntilExpiry,
  readLastActivity,
  writeLastActivity,
} from './inactivity'

describe('isExpired', () => {
  const now = 10_000_000
  it('is not expired right at the limit', () => {
    expect(isExpired(now - INACTIVITY_LIMIT_MS, now)).toBe(false)
  })
  it('expires after 30 minutes', () => {
    expect(isExpired(now - INACTIVITY_LIMIT_MS - 1, now)).toBe(true)
  })
  it('is not expired when there is no record or it is recent', () => {
    expect(isExpired(null, now)).toBe(false)
    expect(isExpired(now - 1000, now)).toBe(false)
    expect(isExpired(Number.NaN, now)).toBe(false)
  })
})

describe('msUntilExpiry', () => {
  it('counts down and never goes negative', () => {
    expect(msUntilExpiry(1000, 1000)).toBe(INACTIVITY_LIMIT_MS)
    expect(msUntilExpiry(1000, 1000 + INACTIVITY_LIMIT_MS + 5)).toBe(0)
  })
})

describe('stored activity', () => {
  it('round-trips and clears', () => {
    writeLastActivity(1234)
    expect(readLastActivity()).toBe(1234)
    clearLastActivity()
    expect(readLastActivity()).toBeNull()
  })
})
