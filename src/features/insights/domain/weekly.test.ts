import { changePercent, compareWeeks, previousWeek, weekOf } from './weekly'

describe('weekOf', () => {
  it('goes Monday to Sunday for a mid-week date', () => {
    // 2026-10-28 is a Wednesday.
    expect(weekOf('2026-10-28')).toEqual({
      from: '2026-10-26',
      to: '2026-11-02',
      lastDay: '2026-11-01',
    })
  })

  it('keeps Monday and Sunday inside their own week', () => {
    expect(weekOf('2026-10-26').from).toBe('2026-10-26')
    expect(weekOf('2026-11-01').from).toBe('2026-10-26')
    expect(weekOf('2026-11-02').from).toBe('2026-11-02')
  })

  it('crosses month and year boundaries', () => {
    expect(weekOf('2027-01-01')).toEqual({
      from: '2026-12-28',
      to: '2027-01-04',
      lastDay: '2027-01-03',
    })
  })

  it('previousWeek is the 7 days before', () => {
    expect(previousWeek(weekOf('2026-10-28'))).toEqual({
      from: '2026-10-19',
      to: '2026-10-26',
      lastDay: '2026-10-25',
    })
  })
})

describe('changePercent', () => {
  it('rounds and handles an empty base', () => {
    expect(changePercent(136, 100)).toBe(36)
    expect(changePercent(50, 100)).toBe(-50)
    expect(changePercent(10, 0)).toBeNull()
  })
})

describe('compareWeeks', () => {
  it('classifies the change', () => {
    expect(compareWeeks(0, 0).direction).toBe('none')
    expect(compareWeeks(500, 0).direction).toBe('new')
    expect(compareWeeks(120, 100)).toEqual({ deltaPercent: 20, direction: 'up' })
    expect(compareWeeks(80, 100)).toEqual({ deltaPercent: -20, direction: 'down' })
    expect(compareWeeks(100, 100)).toEqual({ deltaPercent: 0, direction: 'same' })
    expect(compareWeeks(0, 100)).toEqual({ deltaPercent: -100, direction: 'down' })
  })
})
