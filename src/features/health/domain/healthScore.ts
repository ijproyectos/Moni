import type { Cents } from '@/shared/lib/money'

// Salud financiera: a 0-100 score computed in the client from what the person already recorded. Nothing is invented.
//
// Formula (deterministic, documented here once):
//   Four factors, each turned into a 0..100 sub-score and weighted:
//     ahorro      (35)  savingsRate = (income - expenses) / income           100 at >= 15%, linear down to 0 at <= 0%
//     cuotas      (20)  installments / income                               100 at <= 20%, linear down to 0 at >= 50%
//     fijos       (20)  fixed expenses + subscriptions / income             100 at <= 35%, linear down to 0 at >= 70%
//     presupuesto (25)  share of the person's budgets not exceeded          100 at >= 80%, linear down to 0 at 0%
//   score = round( sum(weight * sub-score) / sum(weight) ) over the factors that HAVE data. A factor without data
//   (no installments recorded, no budgets...) is shown as "—" and neither adds nor subtracts: its weight is left out.
//   Without income there is no denominator for the first three factors: the state is "sin-datos", never a made-up score.

export const SAVINGS_GOAL = 0.15
export const INSTALLMENTS_HEALTHY_MAX = 0.2
export const FIXED_HEALTHY_MAX = 0.35
export const BUDGET_GOAL = 0.8

const INSTALLMENTS_ZERO_AT = 0.5
const FIXED_ZERO_AT = 0.7

export type FactorId = 'savings' | 'installments' | 'fixed' | 'budget'
export type FactorTone = 'ok' | 'warn' | 'bad'

export const FACTOR_WEIGHTS: Record<FactorId, number> = {
  savings: 35,
  installments: 20,
  fixed: 20,
  budget: 25,
}

/** What one month contributes. Null means "no data for that factor". */
export interface HealthMonthInput {
  /** First day of the month, "YYYY-MM-01". */
  month: string
  /** Income to measure against; null/0 means the month has no income recorded. */
  incomeCents: Cents | null
  expenseCents: Cents
  /** Installments charged in the month; null when the person has no installment purchases at all. */
  installmentsCents: Cents | null
  /** Fixed expenses + subscriptions paid in the month; null when the person has none. */
  fixedCents: Cents | null
  /** Share (0..1) of budgets not exceeded; null when there are no budgets. */
  budgetCompliance: number | null
}

export interface HealthFactor {
  id: FactorId
  label: string
  /** "meta 15%", "sano ≤20%". */
  goalLabel: string
  /** The measured value as a fraction (0.09 = 9%); null when there is no data. */
  value: number | null
  /** 0..100, null when there is no data. */
  subScore: number | null
  tone: FactorTone | null
  toneLabel: string | null
  /** Where the goal marker sits on the bar, 0..1 (always the middle for ratios, 0.8 for the budget). */
  markerPosition: number
  /** Bar fill, 0..1. */
  fill: number
}

export type HealthScore =
  | { kind: 'sin-datos' }
  | { kind: 'ok'; score: number; band: HealthBand; factors: HealthFactor[] }

export type HealthBand = 'excelente' | 'bien' | 'mejorable' | 'cuidado'

export const BAND_LABELS: Record<HealthBand, string> = {
  excelente: 'Excelente',
  bien: 'Bien encaminado',
  mejorable: 'Para mejorar',
  cuidado: 'Ojo con tus números',
}

export function bandOf(score: number): HealthBand {
  if (score >= 80) return 'excelente'
  if (score >= 60) return 'bien'
  if (score >= 40) return 'mejorable'
  return 'cuidado'
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** 100 at or below `healthy`, 0 at or above `zeroAt`, linear between. */
function descending(value: number, healthy: number, zeroAt: number): number {
  return Math.round(100 * clamp01((zeroAt - value) / (zeroAt - healthy)))
}

export function savingsSubScore(rate: number): number {
  return Math.round(100 * clamp01(rate / SAVINGS_GOAL))
}

export function installmentsSubScore(ratio: number): number {
  return descending(ratio, INSTALLMENTS_HEALTHY_MAX, INSTALLMENTS_ZERO_AT)
}

export function fixedSubScore(ratio: number): number {
  return descending(ratio, FIXED_HEALTHY_MAX, FIXED_ZERO_AT)
}

export function budgetSubScore(compliance: number): number {
  return Math.round(100 * clamp01(compliance / BUDGET_GOAL))
}

function savingsTone(rate: number): [FactorTone, string] {
  if (rate >= SAVINGS_GOAL) return ['ok', 'Bien']
  if (rate >= SAVINGS_GOAL / 2) return ['warn', 'Mejorable']
  return ['bad', 'Bajo']
}

function installmentsTone(ratio: number): [FactorTone, string] {
  if (ratio <= INSTALLMENTS_HEALTHY_MAX) return ['ok', 'Bien']
  if (ratio <= 0.3) return ['warn', 'Ajustado']
  return ['bad', 'Alto']
}

function fixedTone(ratio: number): [FactorTone, string] {
  if (ratio <= FIXED_HEALTHY_MAX) return ['ok', 'Bien']
  if (ratio <= 0.45) return ['warn', 'Ajustado']
  return ['bad', 'Alto']
}

function budgetTone(compliance: number): [FactorTone, string] {
  if (compliance >= BUDGET_GOAL) return ['ok', 'Bien']
  if (compliance >= 0.6) return ['warn', 'Mejorable']
  return ['bad', 'Bajo']
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`

function buildFactors(m: HealthMonthInput, income: number): HealthFactor[] {
  const savingsRate = (income - m.expenseCents) / income
  const savingsT = savingsTone(savingsRate)
  const factors: HealthFactor[] = [
    {
      id: 'savings',
      label: 'Tasa de ahorro',
      goalLabel: `meta ${pct(SAVINGS_GOAL)}`,
      value: savingsRate,
      subScore: savingsSubScore(savingsRate),
      tone: savingsT[0],
      toneLabel: savingsT[1],
      markerPosition: 0.5,
      fill: clamp01(savingsRate / (SAVINGS_GOAL * 2)),
    },
  ]

  const ratioFactor = (
    id: 'installments' | 'fixed',
    label: string,
    goalLabel: string,
    cents: Cents | null,
    healthy: number,
    sub: (r: number) => number,
    toneOf: (r: number) => [FactorTone, string],
  ): HealthFactor => {
    if (cents === null) {
      return {
        id,
        label,
        goalLabel,
        value: null,
        subScore: null,
        tone: null,
        toneLabel: null,
        markerPosition: 0.5,
        fill: 0,
      }
    }
    const ratio = cents / income
    const [tone, toneLabel] = toneOf(ratio)
    return {
      id,
      label,
      goalLabel,
      value: ratio,
      subScore: sub(ratio),
      tone,
      toneLabel,
      markerPosition: 0.5,
      fill: clamp01(ratio / (healthy * 2)),
    }
  }

  factors.push(
    ratioFactor(
      'installments',
      'Cuotas sobre ingresos',
      `sano ≤${pct(INSTALLMENTS_HEALTHY_MAX)}`,
      m.installmentsCents,
      INSTALLMENTS_HEALTHY_MAX,
      installmentsSubScore,
      installmentsTone,
    ),
    ratioFactor(
      'fixed',
      'Fijos sobre ingresos',
      `sano ≤${pct(FIXED_HEALTHY_MAX)}`,
      m.fixedCents,
      FIXED_HEALTHY_MAX,
      fixedSubScore,
      fixedTone,
    ),
  )

  const budget = m.budgetCompliance
  const [bTone, bLabel] = budget === null ? [null, null] : budgetTone(budget)
  factors.push({
    id: 'budget',
    label: 'Cumplimiento de presupuesto',
    goalLabel: `meta ${pct(BUDGET_GOAL)}`,
    value: budget,
    subScore: budget === null ? null : budgetSubScore(budget),
    tone: bTone,
    toneLabel: bLabel,
    markerPosition: BUDGET_GOAL,
    fill: budget === null ? 0 : clamp01(budget),
  })
  return factors
}

/** Score of one month. "sin-datos" when there is no income to measure against. */
export function computeHealthScore(month: HealthMonthInput): HealthScore {
  const income = month.incomeCents
  if (income === null || income <= 0) return { kind: 'sin-datos' }
  const factors = buildFactors(month, income)
  let weighted = 0
  let weights = 0
  for (const f of factors) {
    if (f.subScore === null) continue
    weighted += FACTOR_WEIGHTS[f.id] * f.subScore
    weights += FACTOR_WEIGHTS[f.id]
  }
  const score = Math.round(weighted / weights)
  return { kind: 'ok', score, band: bandOf(score), factors }
}

export interface HealthSeriesPoint {
  month: string
  /** Null when that month cannot be scored. */
  score: number | null
}

/** Scores of consecutive months (oldest first); months without income come back as null. */
export function healthSeries(months: readonly HealthMonthInput[]): HealthSeriesPoint[] {
  return months.map((m) => {
    const result = computeHealthScore(m)
    return { month: m.month, score: result.kind === 'ok' ? result.score : null }
  })
}

/** Points gained or lost against the previous month; null when the previous month cannot be scored. */
export function scoreDelta(series: readonly HealthSeriesPoint[]): number | null {
  const last = series[series.length - 1]
  const before = series[series.length - 2]
  if (!last || !before || last.score === null || before.score === null) return null
  return last.score - before.score
}

export type HealthSuggestion =
  | {
      kind: 'save'
      /** Amount to set aside each month, rounded to a whole thousand pesos. */
      amountCents: Cents
      fromRate: number
      toRate: number
      newScore: number
    }
  | { kind: 'reduce'; factor: Exclude<FactorId, 'savings'>; value: number }
  | { kind: 'keep' }

const SAVE_STEP = 0.03
const THOUSAND = 100_000

/**
 * One suggestion derived from the numbers. If saving is below the goal, it proposes setting aside up to 3 points of the
 * income (never past the goal) and recomputes the score with that saving. Otherwise it points at the weakest factor.
 */
export function suggestImprovement(month: HealthMonthInput): HealthSuggestion | null {
  const result = computeHealthScore(month)
  const income = month.incomeCents
  if (result.kind !== 'ok' || income === null) return null
  const savings = result.factors.find((f) => f.id === 'savings')
  const rate = savings?.value ?? 0
  if (rate < SAVINGS_GOAL) {
    const step = Math.min(SAVE_STEP, SAVINGS_GOAL - rate)
    const amount = Math.max(THOUSAND, Math.round((step * income) / THOUSAND) * THOUSAND)
    const improved = computeHealthScore({ ...month, expenseCents: month.expenseCents - amount })
    if (improved.kind === 'ok') {
      return {
        kind: 'save',
        amountCents: amount,
        fromRate: rate,
        toRate: (income - (month.expenseCents - amount)) / income,
        newScore: improved.score,
      }
    }
  }
  const weakest = result.factors
    .filter((f) => f.id !== 'savings' && f.subScore !== null && f.tone !== 'ok')
    .sort((a, b) => (a.subScore ?? 0) - (b.subScore ?? 0))[0]
  if (weakest && weakest.value !== null) {
    return { kind: 'reduce', factor: weakest.id as Exclude<FactorId, 'savings'>, value: weakest.value }
  }
  return { kind: 'keep' }
}
