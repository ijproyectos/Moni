import {
  analyzeInstallments,
  presentValue,
  solveMonthlyRate,
  validateInstallmentInput,
  type InstallmentInput,
} from './installments'

const base: InstallmentInput = {
  cashPriceCents: 100_000_00,
  installments: 12,
  installmentCents: 10_000_00,
  monthlyInflationPercent: 0,
}

describe('presentValue', () => {
  it('is the plain sum at 0% inflation', () => {
    expect(presentValue(100, 12, 0)).toBe(1200)
  })

  it('discounts later payments', () => {
    // Annuity factor for 12 months at 3%: 9.954...
    expect(presentValue(100, 12, 0.03)).toBeCloseTo(995.4, 1)
    expect(presentValue(100, 12, 0.03)).toBeLessThan(1200)
  })

  it('a single payment is discounted one month', () => {
    expect(presentValue(110, 1, 0.1)).toBeCloseTo(100, 8)
  })
})

describe('solveMonthlyRate', () => {
  it('finds the rate that makes the installments equal the cash price', () => {
    const r = solveMonthlyRate(100_000, 10_000, 12)
    expect(r).toBeGreaterThan(0.029)
    expect(r).toBeLessThan(0.0295)
    expect(presentValue(10_000, 12, r)).toBeCloseTo(100_000, 4)
  })

  it('returns exactly the surcharge for one installment', () => {
    expect(solveMonthlyRate(100_000, 110_000, 1)).toBeCloseTo(0.1, 8)
  })

  it('is zero when the installments add up to the cash price', () => {
    expect(solveMonthlyRate(120_000, 10_000, 12)).toBeCloseTo(0, 8)
  })

  it('is negative when the installments add up to less than cash', () => {
    expect(solveMonthlyRate(120_000, 9_000, 12)).toBeLessThan(0)
  })

  it('clamps absurd rates instead of looping', () => {
    expect(solveMonthlyRate(100, 1_000_000, 1)).toBe(10)
  })
})

describe('analyzeInstallments', () => {
  it('0% inflation: 12 installments totalling 20% more is cheaper in cash', () => {
    const result = analyzeInstallments({ ...base, installmentCents: 10_000_00 })
    expect(result.presentValueCents).toBe(120_000_00)
    expect(result.totalNominalCents).toBe(120_000_00)
    expect(result.effectiveCostCents).toBe(20_000_00)
    expect(result.effectiveCostPercent).toBeCloseTo(20, 8)
    expect(result.verdict).toBe('contado')
    expect(result.impliedMonthlyRate).toBeCloseTo(0.0292, 3)
  })

  it('0% inflation and no interest is "similar"', () => {
    const result = analyzeInstallments({ ...base, installmentCents: 100_000_00 / 12 })
    expect(result.verdict).toBe('similar')
    expect(Math.abs(result.effectiveCostCents)).toBeLessThan(50)
  })

  it('high inflation makes installments win', () => {
    const result = analyzeInstallments({ ...base, monthlyInflationPercent: 5 })
    expect(result.presentValueCents).toBeCloseTo(88_632_50, -3)
    expect(result.verdict).toBe('cuotas')
    expect(result.effectiveCostCents).toBeLessThan(0)
    expect(result.explanation.join(' ')).toMatch(/Conviene en cuotas/)
  })

  it('inflation close to the implied rate is "similar"', () => {
    const result = analyzeInstallments({ ...base, monthlyInflationPercent: 3 })
    expect(result.verdict).toBe('similar')
    expect(result.explanation.join(' ')).toMatch(/Da casi lo mismo/)
  })

  it('a single installment with 10% surcharge and 0% inflation loses', () => {
    const result = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 110_000_00,
      monthlyInflationPercent: 0,
    })
    expect(result.verdict).toBe('contado')
    expect(result.impliedMonthlyRate).toBeCloseTo(0.1, 8)
    expect(result.explanation.join(' ')).toMatch(/Sin inflación/)
  })

  it('a single installment at the same price is similar', () => {
    const result = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 100_000_00,
      monthlyInflationPercent: 0,
    })
    expect(result.verdict).toBe('similar')
    expect(result.effectiveCostCents).toBe(0)
  })

  it('a single installment is worth less than cash once inflation is high enough', () => {
    const result = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 100_000_00,
      monthlyInflationPercent: 10,
    })
    expect(result.verdict).toBe('cuotas')
    expect(result.presentValueCents).toBe(90_909_09)
    expect(result.explanation.join(' ')).toMatch(/el pago/)
  })

  it('the cash discount can flip the verdict', () => {
    const noDiscount = analyzeInstallments({ ...base, monthlyInflationPercent: 5 })
    expect(noDiscount.verdict).toBe('cuotas')
    const withDiscount = analyzeInstallments({
      ...base,
      monthlyInflationPercent: 5,
      cashDiscountPercent: 20,
    })
    expect(withDiscount.cashPayCents).toBe(80_000_00)
    expect(withDiscount.verdict).toBe('contado')
    expect(withDiscount.explanation[0]).toMatch(/20% de descuento/)
  })

  it('accepts the total financed instead of the installment amount', () => {
    const result = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 12,
      totalFinancedCents: 120_000_00,
      monthlyInflationPercent: 0,
    })
    expect(result.installmentCents).toBe(10_000_00)
    expect(result.totalNominalCents).toBe(120_000_00)
  })

  it('prefers the explicit installment amount over the total', () => {
    const result = analyzeInstallments({
      ...base,
      installmentCents: 9_000_00,
      totalFinancedCents: 999_999_00,
    })
    expect(result.installmentCents).toBe(9_000_00)
  })

  it('installments that add up to less than cash give a negative implied rate', () => {
    const result = analyzeInstallments({ ...base, installmentCents: 8_000_00 })
    expect(result.impliedMonthlyRate).toBeLessThan(0)
    expect(result.verdict).toBe('cuotas')
  })

  it('the verdict boundary is inclusive at +/-2%', () => {
    const exactlyTwoPercentMore = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 102_000_00,
      monthlyInflationPercent: 0,
    })
    expect(exactlyTwoPercentMore.verdict).toBe('similar')
    const justOver = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 102_100_00,
      monthlyInflationPercent: 0,
    })
    expect(justOver.verdict).toBe('contado')
    const justUnder = analyzeInstallments({
      cashPriceCents: 100_000_00,
      installments: 1,
      installmentCents: 97_900_00,
      monthlyInflationPercent: 0,
    })
    expect(justUnder.verdict).toBe('cuotas')
  })

  it('the implied rate reproduces the cash payment', () => {
    const result = analyzeInstallments({ ...base, installmentCents: 12_345_00 })
    const pv = presentValue(12_345_00, 12, result.impliedMonthlyRate)
    expect(Math.abs(pv - 100_000_00)).toBeLessThan(1)
  })

  it('always explains in Spanish with amounts formatted as ARS', () => {
    const result = analyzeInstallments({ ...base, monthlyInflationPercent: 4 })
    expect(result.explanation.length).toBeGreaterThanOrEqual(3)
    expect(result.explanation.join(' ')).toMatch(/\$/)
    expect(result.explanation.join(' ')).toMatch(/por mes/)
  })

  it('throws RangeError on invalid input', () => {
    expect(() => analyzeInstallments({ ...base, installments: 0 })).toThrow(RangeError)
  })
})

describe('validateInstallmentInput', () => {
  it('accepts a valid input', () => {
    expect(validateInstallmentInput(base)).toBeNull()
  })

  it.each([
    [{ cashPriceCents: 0 }, 'invalid_price'],
    [{ cashPriceCents: Number.NaN }, 'invalid_price'],
    [{ installments: 0 }, 'invalid_count'],
    [{ installments: 1.5 }, 'invalid_count'],
    [{ installments: 121 }, 'invalid_count'],
    [{ installmentCents: 0 }, 'invalid_installment'],
    [{ installmentCents: undefined, totalFinancedCents: undefined }, 'invalid_installment'],
    [{ monthlyInflationPercent: -1 }, 'invalid_inflation'],
    [{ monthlyInflationPercent: 101 }, 'invalid_inflation'],
    [{ cashDiscountPercent: -5 }, 'invalid_discount'],
    [{ cashDiscountPercent: 100 }, 'invalid_discount'],
  ] as const)('rejects %j as %s', (patch, code) => {
    expect(validateInstallmentInput({ ...base, ...patch })).toBe(code)
  })
})
