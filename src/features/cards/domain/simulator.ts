import { analyzeInstallments, validateInstallmentInput } from '@/features/budgets/domain/installments'
import type { Cents } from '@/shared/lib/money'

// Simulador "Cuotas vs contado": cash price (with the cash discount) against the installments brought to today's
// money with a monthly inflation. Reuses the present-value model of budgets/domain/installments (payments at the end of
// each month, the first one a month from now). Nothing here touches the database.

export const INSTALLMENT_OPTIONS = [3, 6, 12] as const
export type InstallmentOption = (typeof INSTALLMENT_OPTIONS)[number]

/**
 * Starting monthly inflation of the simulator, in percent. It is a plain estimate, NOT a live index (the app has no
 * inflation source): the person edits it. 2,5% per month is a round middle-of-the-road figure.
 */
export const DEFAULT_MONTHLY_INFLATION_PERCENT = 2.5
export const INFLATION_STEP = 0.5
export const MAX_INFLATION_PERCENT = 30

export interface SimulatorInput {
  cashPriceCents: Cents
  /** Cash/transfer discount in percent (10 = 10% off). */
  discountPercent: number
  count: number
  /** Total paid in installments (the price in cuotas). */
  installmentTotalCents: Cents
  monthlyInflationPercent: number
}

export type SimulatorVerdict = 'contado' | 'cuotas' | 'similar'

export interface SimulatorResult {
  cashPayCents: Cents
  installmentCents: Cents
  installmentTotalCents: Cents
  /** The installments in today's pesos. */
  presentValueCents: Cents
  verdict: SimulatorVerdict
  /** Difference in today's pesos between the two options (always >= 0). */
  savingsCents: Cents
  /** Bar widths, 0..1, the longest one being 1. */
  cashBar: number
  installmentsBar: number
  /**
   * Monthly inflation (percent) above which the installments start to win; null when they already win with no
   * inflation at all (the installments do not add up to more than the cash price).
   */
  breakEvenPercent: number | null
}

/** Price in cuotas to start from: the list price, i.e. installments with no surcharge. The person edits it. */
export function defaultInstallmentTotal(cashPriceCents: Cents): Cents {
  return cashPriceCents
}

export function simulate(input: SimulatorInput): SimulatorResult | null {
  const analysisInput = {
    cashPriceCents: input.cashPriceCents,
    installments: input.count,
    totalFinancedCents: input.installmentTotalCents,
    monthlyInflationPercent: input.monthlyInflationPercent,
    cashDiscountPercent: input.discountPercent,
  }
  if (validateInstallmentInput(analysisInput) !== null) return null
  const a = analyzeInstallments(analysisInput)
  // Whole pesos: the figures are estimates, cents would only suggest false precision.
  const pv = Math.round(a.presentValueCents / 100) * 100
  const cash = Math.round(a.cashPayCents / 100) * 100
  const max = Math.max(cash, pv)
  const breakEven = Math.round(a.impliedMonthlyRate * 1000) / 10
  return {
    cashPayCents: cash,
    installmentCents: a.installmentCents,
    installmentTotalCents: input.installmentTotalCents,
    presentValueCents: pv,
    verdict: a.verdict,
    savingsCents: Math.abs(pv - cash),
    cashBar: max > 0 ? cash / max : 0,
    installmentsBar: max > 0 ? pv / max : 0,
    breakEvenPercent: breakEven <= 0 ? null : breakEven,
  }
}
