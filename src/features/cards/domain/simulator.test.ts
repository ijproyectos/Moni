import { defaultInstallmentTotal, simulate } from './simulator'

const base = {
  cashPriceCents: 1_200_000_00,
  discountPercent: 10,
  count: 6,
  installmentTotalCents: 1_380_000_00,
  monthlyInflationPercent: 2.5,
}

describe('simulate', () => {
  it('brings 6 installments to today with 2.5% monthly inflation', () => {
    const r = simulate(base)
    if (!r) throw new Error('expected result')
    expect(r.cashPayCents).toBe(1_080_000_00)
    expect(r.installmentCents).toBe(230_000_00)
    // 230000 * (1 - 1.025^-6) / 0.025
    expect(r.presentValueCents).toBe(1_266_869_00)
    expect(r.verdict).toBe('contado')
    expect(r.savingsCents).toBe(r.presentValueCents - r.cashPayCents)
    expect(r.cashBar).toBeCloseTo(r.cashPayCents / r.presentValueCents)
    expect(r.installmentsBar).toBe(1)
  })

  it('the break-even inflation makes both options equal', () => {
    const r = simulate(base)
    if (!r || r.breakEvenPercent === null) throw new Error('expected break-even')
    expect(r.breakEvenPercent).toBeGreaterThan(5)
    const atBreakEven = simulate({ ...base, monthlyInflationPercent: r.breakEvenPercent })
    expect(atBreakEven?.verdict).toBe('similar')
    const above = simulate({ ...base, monthlyInflationPercent: r.breakEvenPercent + 3 })
    expect(above?.verdict).toBe('cuotas')
  })

  it('without surcharge or discount, installments win as soon as there is inflation', () => {
    const r = simulate({
      cashPriceCents: 600_000_00,
      discountPercent: 0,
      count: 3,
      installmentTotalCents: defaultInstallmentTotal(600_000_00),
      monthlyInflationPercent: 3,
    })
    expect(r?.verdict).toBe('cuotas')
    expect(r?.breakEvenPercent).toBeNull()
  })

  it('zero inflation: nominal total against cash', () => {
    const r = simulate({ ...base, monthlyInflationPercent: 0 })
    expect(r?.presentValueCents).toBe(1_380_000_00)
  })

  it('returns null for invalid input', () => {
    expect(simulate({ ...base, cashPriceCents: 0 })).toBeNull()
    expect(simulate({ ...base, installmentTotalCents: 0 })).toBeNull()
    expect(simulate({ ...base, discountPercent: 100 })).toBeNull()
  })
})
