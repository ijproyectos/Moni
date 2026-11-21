// Smoke tests for the ported copy: the full behavior is already covered by
// src/features/budgets/domain/installments.test.ts (the source this file is kept in sync with by hand). These just
// confirm the port is byte-for-byte equivalent in its observable behavior.

import {
  analyzeInstallments,
  formatArs,
  presentValue,
  solveMonthlyRate,
  validateInstallmentInput,
  type InstallmentInput,
} from './installments.ts'

const base: InstallmentInput = {
  cashPriceCents: 100_000_00,
  installments: 12,
  installmentCents: 10_000_00,
  monthlyInflationPercent: 0,
}

describe('formatArs', () => {
  it('formats whole and fractional pesos the Argentine way', () => {
    expect(formatArs(1_234_50)).toBe('$1.234,50')
    expect(formatArs(1_500_00)).toBe('$1.500')
    expect(formatArs(-2_200_00)).toBe('-$2.200')
  })
})

describe('validateInstallmentInput', () => {
  it('accepts a sane input', () => {
    expect(validateInstallmentInput(base)).toBeNull()
  })

  it('rejects a non-positive price, bad count, bad inflation and bad discount', () => {
    expect(validateInstallmentInput({ ...base, cashPriceCents: 0 })).toBe('invalid_price')
    expect(validateInstallmentInput({ ...base, installments: 0 })).toBe('invalid_count')
    expect(validateInstallmentInput({ ...base, monthlyInflationPercent: -1 })).toBe('invalid_inflation')
    expect(validateInstallmentInput({ ...base, cashDiscountPercent: 100 })).toBe('invalid_discount')
  })
})

describe('presentValue / solveMonthlyRate', () => {
  it('discounts later payments and solves the implied rate back out', () => {
    expect(presentValue(100, 12, 0)).toBe(1200)
    expect(presentValue(100, 12, 0.03)).toBeLessThan(1200)
    const r = solveMonthlyRate(100_000, 10_000, 12)
    expect(presentValue(10_000, 12, r)).toBeCloseTo(100_000, 4)
  })
})

describe('analyzeInstallments', () => {
  it('favors installments under high inflation', () => {
    const a = analyzeInstallments({ ...base, monthlyInflationPercent: 8 })
    expect(a.verdict).toBe('cuotas')
  })

  it('favors cash with a cash discount and no inflation', () => {
    const a = analyzeInstallments({ ...base, cashDiscountPercent: 15, monthlyInflationPercent: 0 })
    expect(a.verdict).toBe('contado')
  })

  it('throws on invalid input instead of returning garbage', () => {
    expect(() => analyzeInstallments({ ...base, installments: 0 })).toThrow(RangeError)
  })
})
