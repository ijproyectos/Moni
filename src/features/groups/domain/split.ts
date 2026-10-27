import type { Cents } from '@/shared/lib/money'
import type { SplitMethod } from '@/shared/lib/database.types'

// Pure mirror of the SQL in public.create_shared_expense. Keep both in sync: the server is authoritative
// and rejects a split that does not add up, but the UI previews the exact same cents.

export interface SplitShare {
  userId: string
  shareCents: Cents
  /** Percent as typed (e.g. 33.34); null for equal splits. */
  percent: number | null
}

export interface SplitInput {
  method: SplitMethod
  totalCents: Cents
  payerId: string
  participantIds: readonly string[]
  /** Percentages aligned with `participantIds`. Required for the percent method. */
  percents?: readonly number[]
}

export type SplitErrorCode =
  'invalid_amount' | 'invalid_participants' | 'invalid_percent' | 'percents_must_sum_100'

export class SplitError extends Error {
  constructor(readonly code: SplitErrorCode) {
    super(code)
    this.name = 'SplitError'
  }
}

/** Percent in basis points (33.34 -> 3334); null when it has more than 2 decimals or is out of range. */
function toBasisPoints(percent: number): number | null {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null
  const bp = Math.round(percent * 100)
  return Math.abs(bp / 100 - percent) < 1e-9 ? bp : null
}

/** Throws a SplitError when the inputs would be rejected by the database. */
export function validateSplit(input: SplitInput): void {
  const { method, totalCents, participantIds, percents } = input
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new SplitError('invalid_amount')
  if (
    participantIds.length < 1 ||
    participantIds.length > 50 ||
    new Set(participantIds).size !== participantIds.length
  ) {
    throw new SplitError('invalid_participants')
  }
  if (method === 'percent') {
    if (!percents || percents.length !== participantIds.length) {
      throw new SplitError('invalid_percent')
    }
    let sum = 0
    for (const percent of percents) {
      const bp = toBasisPoints(percent)
      if (bp === null) throw new SplitError('invalid_percent')
      sum += bp
    }
    if (sum !== 10000) throw new SplitError('percents_must_sum_100')
  }
}

/**
 * Splits `totalCents` among the participants, in integer cents, summing exactly to the total.
 * Leftover cents go one each, first to the payer (if a participant), then by ascending user id.
 * Equal: base = floor(total / n). Percent: base = floor(total * percent / 100).
 * Shares are returned in the order of `participantIds`.
 */
export function computeSplit(input: SplitInput): SplitShare[] {
  validateSplit(input)
  const { method, totalCents, payerId, participantIds, percents } = input

  const bases = participantIds.map((_, index) => {
    if (method === 'equal') return Math.floor(totalCents / participantIds.length)
    // BigInt: cents * basis points can exceed 2^53 for very large amounts.
    const bp = toBasisPoints(percents?.[index] ?? 0) ?? 0
    return Number((BigInt(totalCents) * BigInt(bp)) / 10000n)
  })

  const leftover = totalCents - bases.reduce((sum, base) => sum + base, 0)
  const order = participantIds
    .map((userId, index) => ({ userId, index }))
    .sort((a, b) => {
      const aRank = a.userId === payerId ? 0 : 1
      const bRank = b.userId === payerId ? 0 : 1
      if (aRank !== bRank) return aRank - bRank
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
    })

  const extra = new Set(order.slice(0, leftover).map((entry) => entry.index))
  return participantIds.map((userId, index) => ({
    userId,
    shareCents: (bases[index] ?? 0) + (extra.has(index) ? 1 : 0),
    percent: method === 'percent' ? (percents?.[index] ?? null) : null,
  }))
}

export interface NetBalance {
  userId: string
  /** Positive: the group owes this member. Negative: this member owes the group. */
  netCents: Cents
}

export interface Transfer {
  fromUserId: string
  toUserId: string
  amountCents: Cents
}

/**
 * Minimal-ish list of payments that settle every balance (greedy: the largest debtor pays the largest
 * creditor). Deterministic: ties break by user id. Nets must add up to zero.
 */
export function simplifyDebts(balances: readonly NetBalance[]): Transfer[] {
  if (balances.reduce((sum, b) => sum + b.netCents, 0) !== 0) {
    throw new Error('Balances must add up to zero')
  }
  const byAmountThenId = (
    a: { userId: string; cents: number },
    b: { userId: string; cents: number },
  ) => b.cents - a.cents || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)

  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ userId: b.userId, cents: -b.netCents }))
    .sort(byAmountThenId)
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ userId: b.userId, cents: b.netCents }))
    .sort(byAmountThenId)

  const transfers: Transfer[] = []
  for (;;) {
    const debtor = debtors[0]
    const creditor = creditors[0]
    if (!debtor || !creditor) break
    const amount = Math.min(debtor.cents, creditor.cents)
    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents: amount })
    debtor.cents -= amount
    creditor.cents -= amount
    if (debtor.cents === 0) debtors.shift()
    if (creditor.cents === 0) creditors.shift()
    debtors.sort(byAmountThenId)
    creditors.sort(byAmountThenId)
  }
  return transfers
}
