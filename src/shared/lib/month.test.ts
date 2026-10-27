import {
  daysInMonth,
  isIsoDate,
  monthRange,
  monthStart,
  shiftMonth,
  todayIso,
  weekdayIndex,
} from './month'

describe('month helpers', () => {
  it('finds the month start', () => {
    expect(monthStart('2026-10-17')).toBe('2026-10-01')
  })

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01')
  })

  it('computes the inclusive month range, including leap years', () => {
    expect(monthRange('2026-10-17')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(daysInMonth('2026-02-01')).toBe(28)
  })

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('26-02-28')).toBe(false)
  })

  it('formats today from local date parts', () => {
    expect(todayIso(new Date(2026, 9, 5))).toBe('2026-10-05')
  })

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-10-26')).toBe(0) // Monday
    expect(weekdayIndex('2026-10-25')).toBe(6) // Sunday
  })
})
