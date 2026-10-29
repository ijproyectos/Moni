import { budgetKeys } from '@/features/budgets/api/queryKeys'
import { dashboardKeys, periodKey } from '@/features/dashboard/api/queryKeys'
import { antKeys } from './useAnts'

// Transaction, category and group mutations invalidate dashboardKeys.all. Ants, period summaries and budget
// data must live under that prefix, otherwise they would go stale after loading a movement.
describe('derived-data query keys', () => {
  const prefix = dashboardKeys.all('u1')

  it.each([
    ['ants', antKeys.month('u1', '2026-10-01')],
    ['period summary', periodKey('u1', '2026-10-26', '2026-11-02')],
    ['budget status', budgetKeys.status('u1', '2026-10-01')],
    ['budget suggestions', budgetKeys.suggestions('u1')],
  ])('%s is invalidated with the dashboard', (_name, key) => {
    expect(key.slice(0, prefix.length)).toEqual([...prefix])
  })

  it('scopes every key to the user', () => {
    expect(antKeys.month('u1', '2026-10-01')).not.toEqual(antKeys.month('u2', '2026-10-01'))
    expect(budgetKeys.status('u1', 'm')).not.toEqual(budgetKeys.status('u2', 'm'))
  })
})
