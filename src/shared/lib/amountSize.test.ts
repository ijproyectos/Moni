import { pairAmountSize } from './amountSize'

describe('pairAmountSize', () => {
  it('shrinks as the longest amount grows, never below the smallest size', () => {
    expect(pairAmountSize(0, 'activity')).toBe('text-[26px]')
    expect(pairAmountSize(11, 'activity')).toBe('text-[26px]')
    expect(pairAmountSize(12, 'activity')).toBe('text-[22px]')
    expect(pairAmountSize(15, 'activity')).toBe('text-[18px]')
    expect(pairAmountSize(40, 'activity')).toBe('text-[15px]')
  })

  it('keeps the home sizes', () => {
    expect(pairAmountSize(11, 'home')).toBe('text-[22px]')
    expect(pairAmountSize(17, 'home')).toBe('text-[14px]')
  })
})
