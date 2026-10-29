import type { Cents } from '@/shared/lib/money'

export interface OverdraftWarning {
  /** Balance of the account before the movement. */
  balanceCents: Cents
  amountCents: Cents
  /** Always negative: what the account would show afterwards. */
  resultingCents: Cents
}

/**
 * A spend larger than the account's balance leaves it negative. Returns the numbers to show in the
 * warning, or null when the account covers the amount (spending exactly the balance is fine).
 * `releasedCents` is the amount of the movement being edited: it is already counted in the balance
 * and goes back to the account when that movement changes.
 */
export function checkOverdraft(input: {
  balanceCents: Cents
  amountCents: Cents
  releasedCents?: Cents
}): OverdraftWarning | null {
  const balanceCents = input.balanceCents + (input.releasedCents ?? 0)
  const resultingCents = balanceCents - input.amountCents
  if (resultingCents >= 0) return null
  return { balanceCents, amountCents: input.amountCents, resultingCents }
}
