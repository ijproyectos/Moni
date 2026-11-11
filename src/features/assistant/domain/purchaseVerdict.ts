import type { Cents } from '@/shared/lib/money'

// "¿Me conviene?": a deterministic verdict for a purchase mentioned in the user's message. Everything here is a pure
// local rule over numbers the app already has (daily allowance, card statements): no model call, nothing invented.

export interface PurchaseRequest {
  amountCents: Cents
  /** 1 = contado / one payment. */
  installments: number
}

const MAX_INSTALLMENTS = 48

/** "180.000", "180000", "1.250,50": es-AR number (dot = thousands, comma = decimals) to a plain number, or null. */
function parseArNumber(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d[\d.]*(,\d{1,2})?$/.test(text)) return null
  const [whole = '', decimals] = text.split(',')
  if (whole.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return null
  const value = Number(`${whole.replaceAll('.', '')}${decimals ? `.${decimals}` : ''}`)
  return Number.isFinite(value) ? value : null
}

const NUMBER = String.raw`\d[\d.]*(?:,\d{1,2})?`
const AMOUNT_RE = new RegExp(
  String.raw`(\$\s*)?(${NUMBER})(?:\s*(mil\b|k\b|lucas\b|palos?\b|millón\b|millones\b))?`,
  'gi',
)
const INSTALLMENTS_RE = /(\d{1,2})\s*(?:cuotas?|pagos)\b/i

/**
 * Reads a purchase from free text: an amount ("$180.000", "180 mil", "180k") and, optionally, "3 cuotas". The amount
 * needs a "$" or a suffix ("mil", "k"), or at least 1.000 as a plain number; the number that belongs to "N cuotas" is
 * never taken as the price. Returns null when there is no amount.
 */
export function parsePurchaseMessage(text: string): PurchaseRequest | null {
  const installmentsMatch = INSTALLMENTS_RE.exec(text)
  const installments = installmentsMatch ? Number(installmentsMatch[1]) : 1
  if (installments < 1 || installments > MAX_INSTALLMENTS) return null
  // Hide the "N cuotas" part so its number is not read as the price.
  const rest = installmentsMatch ? text.replace(INSTALLMENTS_RE, ' ') : text

  let best: number | null = null
  for (const match of rest.matchAll(AMOUNT_RE)) {
    const [, dollar, digits = '', suffix] = match
    const base = parseArNumber(digits)
    if (base === null) continue
    const word = suffix?.toLowerCase()
    const multiplier =
      word === undefined
        ? 1
        : word.startsWith('mill')
          ? 1_000_000
          : word === 'mil' || word === 'k' || word === 'lucas'
            ? 1_000
            : word.startsWith('palo')
              ? 1_000_000
              : 1
    const value = base * multiplier
    const qualifies = Boolean(dollar) || word !== undefined || value >= 1_000
    if (!qualifies || value <= 0) continue
    if (best === null || value > best) best = value
  }
  if (best === null) return null
  return { amountCents: Math.round(best * 100), installments }
}

export type Verdict = 'conviene' | 'espera' | 'no-conviene'

export const VERDICT_LABELS: Record<Verdict, string> = {
  conviene: 'Conviene',
  espera: 'Esperá',
  'no-conviene': 'No conviene',
}

/** Share of today's daily allowance that the first payment may eat before the verdict turns to "Esperá". */
export const WAIT_DROP_SHARE = 0.25

export interface VerdictInput {
  request: PurchaseRequest
  /** From the daily allowance; null when there is no income recorded (no verdict is possible). */
  allowance: { dailyCents: Cents; remainingCents: Cents; daysLeft: number } | null
  /** Projected statement total (with the new installments) above the ceiling; null when unknown. */
  statementOverCeiling?: boolean | null
}

export interface VerdictResult {
  verdict: Verdict
  perInstallmentCents: Cents
  /** What can be spent today and each remaining day, before and after the first payment. */
  beforeDailyCents: Cents
  afterDailyCents: Cents
  /** Money left of the month's budget once the first payment is made (negative: not enough). */
  afterRemainingCents: Cents
}

/** Every installment but the first absorbs the rounding leftovers last, so the first one is the largest. */
export function firstInstallmentCents(request: PurchaseRequest): Cents {
  return Math.ceil(request.amountCents / request.installments)
}

/** The verdict, or null when there is nothing to judge it with (no allowance data). */
export function evaluatePurchase(input: VerdictInput): VerdictResult | null {
  const { request, allowance } = input
  if (!allowance) return null
  const first = firstInstallmentCents(request)
  const afterRemaining = allowance.remainingCents - first
  const afterDaily = afterRemaining > 0 ? Math.floor(afterRemaining / allowance.daysLeft) : 0
  const drop =
    allowance.dailyCents > 0 ? (allowance.dailyCents - afterDaily) / allowance.dailyCents : 1
  const verdict: Verdict =
    afterRemaining < 0
      ? 'no-conviene'
      : drop > WAIT_DROP_SHARE || input.statementOverCeiling === true
        ? 'espera'
        : 'conviene'
  return {
    verdict,
    perInstallmentCents: first,
    beforeDailyCents: allowance.dailyCents,
    afterDailyCents: afterDaily,
    afterRemainingCents: afterRemaining,
  }
}

export interface ProjectedBar {
  closingOn: string
  /** What the statement already holds. */
  currentCents: Cents
  /** What this purchase would add to it. */
  addedCents: Cents
}

/**
 * Statement bars with the purchase's installments added from the first one on: installment i lands in the i-th
 * statement. Statements beyond the last installment are unchanged.
 */
export function projectStatements(
  bars: readonly { closingOn: string; totalCents: Cents }[],
  request: PurchaseRequest,
): ProjectedBar[] {
  const base = Math.floor(request.amountCents / request.installments)
  const extra = request.amountCents - base * request.installments
  return bars.map((bar, i) => ({
    closingOn: bar.closingOn,
    currentCents: bar.totalCents,
    addedCents: i < request.installments ? base + (i < extra ? 1 : 0) : 0,
  }))
}

/** True when any projected statement goes past the ceiling. */
export function overCeiling(bars: readonly ProjectedBar[], ceilingCents: Cents | null): boolean | null {
  if (ceilingCents === null || bars.length === 0) return null
  return bars.some((b) => b.currentCents + b.addedCents > ceilingCents)
}
