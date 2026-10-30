import { FEATURES } from './features'

describe('FEATURES', () => {
  it('ships every flag off: none of these screens has a real backend yet', () => {
    expect(Object.values(FEATURES).every((on) => on === false)).toBe(true)
    expect(Object.keys(FEATURES)).toEqual(
      expect.arrayContaining([
        'notifications',
        'debts',
        'aguinaldo',
        'soloTrips',
        'pro',
        'referral',
        'sharedGoals',
        'weeklyDigest',
        'accountAlias',
        'groupGuestsAndSimulatedSplits',
      ]),
    )
  })
})
