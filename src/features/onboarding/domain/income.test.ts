import { leftoverPercent, parsePayDay, suggestedBudgetCents } from './income'

describe('suggestedBudgetCents', () => {
  it('is zero without income', () => {
    expect(suggestedBudgetCents(0)).toBe(0)
    expect(suggestedBudgetCents(-5)).toBe(0)
  })
  it('keeps 85% rounded down to a whole thousand pesos', () => {
    // 85% of $1.000.000 = $850.000
    expect(suggestedBudgetCents(1_000_000_00)).toBe(850_000_00)
    // 85% of $1.234.567 = $1.049.382,95 -> $1.049.000
    expect(suggestedBudgetCents(1_234_567_00)).toBe(1_049_000_00)
  })
  it('does not round a tiny income down to zero', () => {
    expect(suggestedBudgetCents(500_00)).toBe(425_00)
  })
})

describe('leftoverPercent', () => {
  it('is about the savings share', () => {
    expect(leftoverPercent(1_000_000_00)).toBe(15)
    expect(leftoverPercent(0)).toBe(0)
  })
})

describe('parsePayDay', () => {
  it('accepts 1 to 31 only', () => {
    expect(parsePayDay('15')).toBe(15)
    expect(parsePayDay(' 7 ')).toBe(7)
    expect(parsePayDay('0')).toBeNull()
    expect(parsePayDay('32')).toBeNull()
    expect(parsePayDay('abc')).toBeNull()
    expect(parsePayDay('')).toBeNull()
  })
})
