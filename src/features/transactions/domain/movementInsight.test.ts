import { categoryWeekInsight } from './movementInsight'
import { makeTransaction } from './testing'

const cat = (id: string, occurredOn: string, extra = {}) =>
  makeTransaction({ id, occurredOn, categoryId: 'c1', ...extra })

describe('categoryWeekInsight', () => {
  const target = cat('t', '2026-11-09')
  const history = [
    cat('h1', '2026-10-20'),
    cat('h2', '2026-10-27'),
    cat('h3', '2026-10-13'),
    cat('h4', '2026-10-14'),
  ]

  it('counts the week and compares with the usual weekly average', () => {
    const week = [target, cat('a', '2026-11-08'), cat('b', '2026-11-06'), cat('c', '2026-11-05')]
    expect(categoryWeekInsight(target, [...week, ...history])).toEqual({ count: 4, average: 1 })
  })

  it('says nothing without history to compare with', () => {
    expect(categoryWeekInsight(target, [target, cat('a', '2026-11-08')])).toBeNull()
  })

  it('says nothing when it is not above the usual', () => {
    expect(categoryWeekInsight(target, [target, ...history])).toBeNull()
  })

  it('says nothing for incomes or movements without category', () => {
    expect(categoryWeekInsight(cat('i', '2026-11-09', { kind: 'income' }), history)).toBeNull()
    expect(categoryWeekInsight(cat('n', '2026-11-09', { categoryId: null }), history)).toBeNull()
  })
})
