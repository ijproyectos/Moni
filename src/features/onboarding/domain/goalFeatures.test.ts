import { featuresForGoals, goalsForSelector, sanitizeGoals } from './goals'

describe('goal personalization', () => {
  it('shows everything when no goal was chosen', () => {
    expect(featuresForGoals([]).size).toBe(8)
    expect(featuresForGoals(null).has('trips')).toBe(true)
  })

  it('only enables the sections of the chosen goals', () => {
    const features = featuresForGoals(['plan_trips', 'track_spending'])
    expect([...features].sort()).toEqual(['ants', 'reports', 'trips'])
    expect(features.has('groups')).toBe(false)
  })

  it('ignores unknown goal ids and the derived "all" option', () => {
    expect(sanitizeGoals(['all', 'nope', 'split_expenses'])).toEqual(['split_expenses'])
    expect([...featuresForGoals(['nope'])].length).toBe(8)
  })

  it('checks "Todo lo anterior" when every goal is saved', () => {
    const all = [
      'track_spending',
      'save_monthly',
      'split_expenses',
      'control_recurring',
      'plan_trips',
    ]
    expect(goalsForSelector(all)).toContain('all')
    expect(goalsForSelector(['save_monthly'])).toEqual(['save_monthly'])
  })
})
