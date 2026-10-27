import { ALL_GOALS_ID, goalsToPersist, toggleGoal } from './goals'

describe('toggleGoal', () => {
  it('selecting "Todo lo anterior" selects every goal', () => {
    const selected = toggleGoal([], ALL_GOALS_ID)
    expect(selected).toHaveLength(5)
    expect(goalsToPersist(selected)).toHaveLength(4)
  })

  it('unchecking one goal also clears the aggregate option', () => {
    const all = toggleGoal([], ALL_GOALS_ID)
    expect(toggleGoal(all, 'save_monthly')).not.toContain(ALL_GOALS_ID)
  })

  it('checking the last remaining goal checks the aggregate option', () => {
    let selected: string[] = []
    for (const id of ['track_spending', 'save_monthly', 'split_expenses', 'control_recurring']) {
      selected = toggleGoal(selected, id)
    }
    expect(selected).toContain(ALL_GOALS_ID)
  })
})
