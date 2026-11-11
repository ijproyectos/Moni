import {
  evaluatePurchase,
  firstInstallmentCents,
  overCeiling,
  parsePurchaseMessage,
  projectStatements,
} from './purchaseVerdict'

describe('parsePurchaseMessage', () => {
  it('reads the amount and the installments', () => {
    expect(parsePurchaseMessage('Quiero comprar una campera de $180.000 en 3 cuotas. ¿Me conviene?')).toEqual({
      amountCents: 180_000_00,
      installments: 3,
    })
  })
  it('one payment when there are no installments', () => {
    expect(parsePurchaseMessage('¿Me conviene gastar $45000 en zapatillas?')).toEqual({
      amountCents: 45_000_00,
      installments: 1,
    })
  })
  it('understands "mil", "k" and decimals', () => {
    expect(parsePurchaseMessage('una tele de 350 mil')?.amountCents).toBe(350_000_00)
    expect(parsePurchaseMessage('comprar 90k en 6 cuotas')).toEqual({ amountCents: 90_000_00, installments: 6 })
    expect(parsePurchaseMessage('$1.250,50 de regalo')?.amountCents).toBe(1_250_50)
  })
  it('never takes the number of installments as the price', () => {
    expect(parsePurchaseMessage('en 12 cuotas')).toBeNull()
    expect(parsePurchaseMessage('¿cuotas o contado? 6 cuotas')).toBeNull()
  })
  it('is null without an amount', () => {
    expect(parsePurchaseMessage('¿Cómo vengo este mes?')).toBeNull()
    expect(parsePurchaseMessage('')).toBeNull()
    expect(parsePurchaseMessage('compré 3 remeras')).toBeNull()
  })
})

describe('evaluatePurchase', () => {
  const allowance = { dailyCents: 24_300_00, remainingCents: 486_000_00, daysLeft: 20 }
  it('conviene when the first payment barely moves the day', () => {
    const r = evaluatePurchase({ request: { amountCents: 24_000_00, installments: 6 }, allowance })
    expect(r?.verdict).toBe('conviene')
    expect(r?.perInstallmentCents).toBe(4_000_00)
  })
  it('shows the day before and after the first payment', () => {
    const r = evaluatePurchase({ request: { amountCents: 180_000_00, installments: 3 }, allowance })
    expect(r).toMatchObject({ perInstallmentCents: 60_000_00, beforeDailyCents: 24_300_00 })
    expect(r?.afterDailyCents).toBe(21_300_00)
  })
  it('espera when it eats a big share of the daily allowance', () => {
    const r = evaluatePurchase({ request: { amountCents: 150_000_00, installments: 1 }, allowance })
    expect(r?.verdict).toBe('espera')
  })
  it('espera when the card statement would pass the ceiling, even if the day is fine', () => {
    const r = evaluatePurchase({
      request: { amountCents: 24_000_00, installments: 6 },
      allowance,
      statementOverCeiling: true,
    })
    expect(r?.verdict).toBe('espera')
  })
  it('no conviene when the first payment is more than what is left', () => {
    const r = evaluatePurchase({ request: { amountCents: 600_000_00, installments: 1 }, allowance })
    expect(r?.verdict).toBe('no-conviene')
    expect(r?.afterDailyCents).toBe(0)
  })
  it('no verdict without allowance data', () => {
    expect(evaluatePurchase({ request: { amountCents: 100, installments: 1 }, allowance: null })).toBeNull()
  })
})

describe('statement projection', () => {
  const bars = [
    { closingOn: '2026-12-23', totalCents: 100_00 },
    { closingOn: '2027-01-23', totalCents: 50_00 },
    { closingOn: '2027-02-23', totalCents: 50_00 },
    { closingOn: '2027-03-23', totalCents: 10_00 },
  ]
  it('adds each installment to a consecutive statement', () => {
    const p = projectStatements(bars, { amountCents: 100_00, installments: 3 })
    expect(p.map((b) => b.addedCents)).toEqual([33_34, 33_33, 33_33, 0])
    expect(p.reduce((s, b) => s + b.addedCents, 0)).toBe(100_00)
  })
  it('flags a statement over the ceiling, and null without one', () => {
    const p = projectStatements(bars, { amountCents: 100_00, installments: 1 })
    expect(overCeiling(p, 200_00)).toBe(false)
    expect(overCeiling(p, 199_99)).toBe(true)
    expect(overCeiling(p, null)).toBeNull()
  })
  it('the first installment is the largest', () => {
    expect(firstInstallmentCents({ amountCents: 100_00, installments: 3 })).toBe(33_34)
  })
})
