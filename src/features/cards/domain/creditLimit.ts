import type { Cents } from '@/shared/lib/money'

export interface CreditLimitWarning {
  limitCents: Cents
  /** Debt before the purchase (billed + to be billed + future installments). */
  debtCents: Cents
  amountCents: Cents
  /** Always negative: how far over the limit the card would be. */
  resultingAvailableCents: Cents
}

/**
 * A card purchase (the whole amount of an installment purchase, since all of it is committed from the
 * first day) larger than the available credit leaves the card over its limit. Returns the numbers for
 * the warning, or null when it fits or the card has no limit set.
 * `releasedCents` is the amount of the purchase being edited: it is already inside the debt.
 */
export function checkCreditLimit(input: {
  limitCents: Cents | null
  /** Balance of the card account: negative while money is owed. */
  balanceCents: Cents
  amountCents: Cents
  releasedCents?: Cents
}): CreditLimitWarning | null {
  if (input.limitCents === null) return null
  const debtCents = Math.max(0, -input.balanceCents - (input.releasedCents ?? 0))
  const resultingAvailableCents = input.limitCents - debtCents - input.amountCents
  if (resultingAvailableCents >= 0) return null
  return {
    limitCents: input.limitCents,
    debtCents,
    amountCents: input.amountCents,
    resultingAvailableCents,
  }
}
