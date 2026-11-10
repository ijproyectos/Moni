import { todayAfterExpense } from './todayLeft'

describe('todayAfterExpense', () => {
  it('subtracts the expense from today and reports the share used', () => {
    expect(todayAfterExpense(24_300_00, 4_800_00)).toEqual({
      leftCents: 19_500_00,
      usedPercent: 20,
      status: 'vas-bien',
    })
  })
  it('reads ajustado from 70% used and te-pasaste when nothing is left', () => {
    expect(todayAfterExpense(10_000, 7_000).status).toBe('ajustado')
    expect(todayAfterExpense(10_000, 10_000)).toEqual({
      leftCents: 0,
      usedPercent: 100,
      status: 'te-pasaste',
    })
    expect(todayAfterExpense(0, 500).status).toBe('te-pasaste')
  })
})
