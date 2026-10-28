import { formatArs, type Cents } from '@/shared/lib/money'

// "¿Conviene en cuotas?" — pure comparison between paying cash and paying in installments.
//
// Model: the installments are paid at the end of each month (the first one a month from now), and money
// loses value with the user's expected monthly inflation. The present value of the installments is what
// they are "worth" today; if that is below the cash price, installments win. Nothing here touches the
// database or the network.

export interface InstallmentInput {
  /** List/cash price before any cash discount. */
  cashPriceCents: Cents
  /** Number of monthly installments (1..MAX_INSTALLMENTS). */
  installments: number
  /** Amount of each installment. Provide this or `totalFinancedCents`. */
  installmentCents?: Cents
  /** Total paid in installments; each one is total / installments. Ignored when `installmentCents` is set. */
  totalFinancedCents?: Cents
  /** Expected monthly inflation, in percent (3 = 3% per month). */
  monthlyInflationPercent: number
  /** Discount for paying cash, in percent (10 = 10% off). Defaults to 0. */
  cashDiscountPercent?: number
}

export type InstallmentVerdict = 'cuotas' | 'contado' | 'similar'

export interface InstallmentAnalysis {
  /** What you pay up front after the cash discount. */
  cashPayCents: Cents
  /** Amount of each installment. */
  installmentCents: Cents
  /** Sum of all installments, with no inflation adjustment. */
  totalNominalCents: Cents
  /** The installments brought to today's money using the expected inflation. */
  presentValueCents: Cents
  /** presentValue - cashPay. Positive: the installments cost more than paying cash. */
  effectiveCostCents: Cents
  /** effectiveCost relative to the cash payment, in percent (positive: installments cost more). */
  effectiveCostPercent: number
  /** Monthly rate that makes the installments equal the cash payment (a CFT-like figure), as a fraction. */
  impliedMonthlyRate: number
  verdict: InstallmentVerdict
  /** Spanish (rioplatense) explanation, one sentence per entry. */
  explanation: string[]
}

export type InstallmentInputError =
  | 'invalid_price'
  | 'invalid_count'
  | 'invalid_installment'
  | 'invalid_inflation'
  | 'invalid_discount'

export const MAX_INSTALLMENTS = 120
/** Difference (relative to the cash payment) under which both options are considered the same. */
export const SIMILAR_TOLERANCE = 0.02

const MIN_RATE = -0.95
const MAX_RATE = 10

function installmentAmount(input: InstallmentInput): number | null {
  if (input.installmentCents !== undefined) return input.installmentCents
  if (input.totalFinancedCents !== undefined) return input.totalFinancedCents / input.installments
  return null
}

export function validateInstallmentInput(input: InstallmentInput): InstallmentInputError | null {
  if (!Number.isFinite(input.cashPriceCents) || input.cashPriceCents <= 0) return 'invalid_price'
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 1 ||
    input.installments > MAX_INSTALLMENTS
  ) {
    return 'invalid_count'
  }
  const amount = installmentAmount(input)
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return 'invalid_installment'
  const inflation = input.monthlyInflationPercent
  if (!Number.isFinite(inflation) || inflation < 0 || inflation > 100) return 'invalid_inflation'
  const discount = input.cashDiscountPercent ?? 0
  if (!Number.isFinite(discount) || discount < 0 || discount >= 100) return 'invalid_discount'
  return null
}

/** Present value of `count` equal payments made at the end of each month, discounted at `monthlyRate`. */
export function presentValue(amount: number, count: number, monthlyRate: number): number {
  if (monthlyRate === 0) return amount * count
  return (amount * (1 - (1 + monthlyRate) ** -count)) / monthlyRate
}

/**
 * Monthly rate r that solves presentValue(installment, count, r) = cashPay (bisection: the present value
 * strictly decreases as the rate grows). Negative when the installments add up to less than the cash price.
 * Clamped to [-95%, 1000%] per month.
 */
export function solveMonthlyRate(cashPay: number, installment: number, count: number): number {
  let lo = MIN_RATE
  let hi = MAX_RATE
  if (presentValue(installment, count, lo) <= cashPay) return lo
  if (presentValue(installment, count, hi) >= cashPay) return hi
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (presentValue(installment, count, mid) > cashPay) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function formatPercent(value: number): string {
  return `${(Math.round(value * 10) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

function buildExplanation(a: Omit<InstallmentAnalysis, 'explanation'>, input: InstallmentInput) {
  const lines: string[] = []
  const discount = input.cashDiscountPercent ?? 0
  const count = input.installments
  const plan = count === 1 ? 'el pago' : `las ${count} cuotas de ${formatArs(a.installmentCents)}`

  if (discount > 0) {
    lines.push(
      `Pagando de contado con ${formatPercent(discount)} de descuento, desembolsás ${formatArs(a.cashPayCents)}.`,
    )
  }
  const inflation = input.monthlyInflationPercent
  if (inflation === 0) {
    lines.push(
      `Sin inflación, cada cuota vale lo mismo que hoy: en total pagás ${formatArs(a.totalNominalCents)}.`,
    )
  } else {
    lines.push(
      `Con una inflación de ${formatPercent(inflation)} por mes, ${plan} equivalen hoy a ${formatArs(a.presentValueCents)}.`,
    )
  }

  const gap = Math.abs(a.effectiveCostCents)
  if (a.verdict === 'cuotas') {
    lines.push(
      `Conviene en cuotas: es ${formatArs(gap)} menos que los ${formatArs(a.cashPayCents)} de contado, porque la inflación se come parte de lo que pagás más adelante.`,
    )
  } else if (a.verdict === 'contado') {
    lines.push(
      `Conviene pagar de contado: en cuotas terminás pagando ${formatArs(gap)} más, en plata de hoy.`,
    )
  } else {
    lines.push(
      `Da casi lo mismo: la diferencia es de ${formatArs(gap)} (menos del ${formatPercent(SIMILAR_TOLERANCE * 100)}). Elegí lo que te deje más tranquilo.`,
    )
  }

  lines.push(
    `El financiamiento te sale ${formatPercent(a.impliedMonthlyRate * 100)} por mes, contra ${formatPercent(inflation)} de inflación que estimás.`,
  )
  return lines
}

/** Compares paying cash against paying in installments. Throws RangeError when the input is invalid. */
export function analyzeInstallments(input: InstallmentInput): InstallmentAnalysis {
  const error = validateInstallmentInput(input)
  if (error) throw new RangeError(error)

  const amount = installmentAmount(input) as number
  const count = input.installments
  const cashPay = input.cashPriceCents * (1 - (input.cashDiscountPercent ?? 0) / 100)
  const pv = presentValue(amount, count, input.monthlyInflationPercent / 100)
  const ratio = pv / cashPay

  const verdict: InstallmentVerdict =
    Math.abs(ratio - 1) <= SIMILAR_TOLERANCE + 1e-9 ? 'similar' : ratio < 1 ? 'cuotas' : 'contado'

  const base = {
    cashPayCents: Math.round(cashPay),
    installmentCents: Math.round(amount),
    totalNominalCents: Math.round(amount * count),
    presentValueCents: Math.round(pv),
    effectiveCostCents: Math.round(pv - cashPay),
    effectiveCostPercent: (ratio - 1) * 100,
    impliedMonthlyRate: solveMonthlyRate(cashPay, amount, count),
    verdict,
  }
  return { ...base, explanation: buildExplanation(base, input) }
}
