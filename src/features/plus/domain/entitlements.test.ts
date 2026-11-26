import { canCreateMore, FREE_LIMITS, isPlusOnly, PLUS_ONLY_FEATURES, reasonOf, type PlusFeature } from './entitlements'
import { PLUS_PROMO } from './promoCopy'

describe('Free and Plus rules', () => {
  it('Free gets one group, one goal and one trip in total', () => {
    expect(FREE_LIMITS).toEqual({ groups: 1, goals: 1, trips: 1 })
  })

  it('Free can create while under the limit and never past it; Plus has no limit', () => {
    expect(canCreateMore('goals', 0, true)).toBe(true)
    expect(canCreateMore('goals', 1, true)).toBe(false)
    expect(canCreateMore('trips', 1, true)).toBe(false)
    expect(canCreateMore('groups', 1, true)).toBe(false)
    expect(canCreateMore('goals', 25, false)).toBe(true)
  })

  it('groups, goals and trips are NOT Plus-only (they have a free modality); the rest of the premium list is', () => {
    for (const f of ['groups', 'goals', 'trips'] as PlusFeature[]) expect(isPlusOnly(f)).toBe(false)
    for (const f of ['photo', 'voice', 'assistant', 'reminders', 'mercadopago', 'health', 'recurring', 'ants', 'reports', 'smart_notices', 'excel_import'] as PlusFeature[]) {
      expect(isPlusOnly(f)).toBe(true)
    }
    expect(PLUS_ONLY_FEATURES).toHaveLength(11)
  })

  it('every capability has its own promo and the Plus screen reason', () => {
    for (const f of Object.keys(PLUS_PROMO) as PlusFeature[]) {
      expect(PLUS_PROMO[f].title.length).toBeGreaterThan(5)
      expect(reasonOf(f)).toBeTruthy()
    }
    expect(Object.keys(PLUS_PROMO)).toHaveLength(14)
  })
})
