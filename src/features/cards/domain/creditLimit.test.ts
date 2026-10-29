import { checkCreditLimit } from './creditLimit'

describe('checkCreditLimit', () => {
  it('does not warn without a limit or when the purchase fits (even exactly)', () => {
    expect(
      checkCreditLimit({ limitCents: null, balanceCents: -900_000_00, amountCents: 1 }),
    ).toBeNull()
    expect(
      checkCreditLimit({
        limitCents: 500_000_00,
        balanceCents: -100_000_00,
        amountCents: 400_000_00,
      }),
    ).toBeNull()
  })

  it('warns with limit, debt and how far over the limit it ends', () => {
    expect(
      checkCreditLimit({
        limitCents: 500_000_00,
        balanceCents: -450_000_00,
        amountCents: 100_000_00,
      }),
    ).toEqual({
      limitCents: 500_000_00,
      debtCents: 450_000_00,
      amountCents: 100_000_00,
      resultingAvailableCents: -50_000_00,
    })
  })

  it('counts the whole installment purchase, not just its first installment', () => {
    // 840.000 in 12 installments on a card with 500.000 available is over the limit from day one.
    expect(
      checkCreditLimit({ limitCents: 500_000_00, balanceCents: 0, amountCents: 840_000_00 })
        ?.resultingAvailableCents,
    ).toBe(-340_000_00)
  })

  it('treats a card with credit in favor as zero debt', () => {
    expect(
      checkCreditLimit({ limitCents: 100_00, balanceCents: 5_000_00, amountCents: 100_00 }),
    ).toBeNull()
  })

  it('gives back the amount of the purchase being edited', () => {
    // Debt 90.000 includes the 30.000 purchase being edited: without it the debt is 60.000.
    expect(
      checkCreditLimit({
        limitCents: 100_000_00,
        balanceCents: -90_000_00,
        amountCents: 40_000_00,
        releasedCents: 30_000_00,
      }),
    ).toBeNull()
    expect(
      checkCreditLimit({
        limitCents: 100_000_00,
        balanceCents: -90_000_00,
        amountCents: 45_000_00,
        releasedCents: 30_000_00,
      })?.resultingAvailableCents,
    ).toBe(-5_000_00)
  })
})
