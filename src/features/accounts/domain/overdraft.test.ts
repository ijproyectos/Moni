import { checkOverdraft } from './overdraft'

describe('checkOverdraft', () => {
  it('does not warn when the balance covers the spend, even exactly', () => {
    expect(checkOverdraft({ balanceCents: 10_000_00, amountCents: 4_000_00 })).toBeNull()
    expect(checkOverdraft({ balanceCents: 10_000_00, amountCents: 10_000_00 })).toBeNull()
  })

  it('warns with current balance, amount and the negative result', () => {
    expect(checkOverdraft({ balanceCents: 10_000_00, amountCents: 25_000_00 })).toEqual({
      balanceCents: 10_000_00,
      amountCents: 25_000_00,
      resultingCents: -15_000_00,
    })
  })

  it('warns again when the account is already negative or empty', () => {
    expect(checkOverdraft({ balanceCents: -1_000_00, amountCents: 500_00 })?.resultingCents).toBe(
      -1_500_00,
    )
    expect(checkOverdraft({ balanceCents: 0, amountCents: 1 })?.resultingCents).toBe(-1)
  })

  it('counts back the movement being edited', () => {
    // Balance 3.000 already includes an expense of 7.000; raising it to 9.000 leaves 1.000.
    expect(
      checkOverdraft({ balanceCents: 3_000_00, amountCents: 9_000_00, releasedCents: 7_000_00 }),
    ).toBeNull()
    expect(
      checkOverdraft({ balanceCents: 3_000_00, amountCents: 11_000_00, releasedCents: 7_000_00 })
        ?.resultingCents,
    ).toBe(-1_000_00)
  })
})
