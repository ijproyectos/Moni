import type { Cents } from '@/shared/lib/money'
import { parsePercentInput } from './group'
import { computeSplit, SplitError, type SplitShare } from './split'
import type { SplitMethod } from '@/shared/lib/database.types'

export interface ExpensePreviewInput {
  method: SplitMethod
  totalCents: Cents | null
  payerId: string
  participantIds: readonly string[]
  /** Percent text typed per participant id. */
  percentTexts: Readonly<Record<string, string>>
}

export interface ExpensePreview {
  /** Present when the split is valid. */
  shares: SplitShare[] | null
  /** Percent total in basis points (percent method only). */
  percentTotalBp: number
  /** Short Spanish hint for what is missing, or null when the split is valid. */
  problem: string | null
}

/** Live preview for the shared-expense form, using the same domain split as the server. */
export function previewSplit(input: ExpensePreviewInput): ExpensePreview {
  const { method, totalCents, payerId, participantIds, percentTexts } = input

  const parsed = participantIds.map((id) => parsePercentInput(percentTexts[id] ?? ''))
  const percentTotalBp =
    method === 'percent'
      ? parsed.reduce<number>((sum, p) => sum + Math.round((p ?? 0) * 100), 0)
      : 0

  if (participantIds.length === 0) {
    return { shares: null, percentTotalBp, problem: 'Elegí al menos una persona.' }
  }
  if (totalCents === null || totalCents <= 0) {
    return {
      shares: null,
      percentTotalBp,
      problem: 'Ingresá el monto para ver cuánto le toca a cada uno.',
    }
  }
  if (method === 'percent') {
    if (parsed.some((p) => p === null)) {
      return { shares: null, percentTotalBp, problem: 'Completá el porcentaje de cada persona.' }
    }
    if (percentTotalBp !== 10000) {
      return { shares: null, percentTotalBp, problem: 'Los porcentajes tienen que sumar 100.' }
    }
  }
  try {
    const shares = computeSplit({
      method,
      totalCents,
      payerId,
      participantIds,
      percents: method === 'percent' ? parsed.map((p) => p ?? 0) : undefined,
    })
    return { shares, percentTotalBp, problem: null }
  } catch (e) {
    if (e instanceof SplitError) {
      return { shares: null, percentTotalBp, problem: 'Revisá los datos de la división.' }
    }
    throw e
  }
}

/** Percent total as text for the live counter: 10000 -> "100", 9999 -> "99,99". */
export function formatPercentTotal(bp: number): string {
  const whole = Math.trunc(bp / 100)
  const fraction = bp % 100
  return fraction === 0 ? String(whole) : `${whole},${String(fraction).padStart(2, '0')}`
}

/** Equal percentages as editable text that add up to exactly 100: 3 people -> 33,34 / 33,33 / 33,33. */
export function equalPercentTexts(count: number): string[] {
  if (count <= 0) return []
  const base = Math.floor(10000 / count)
  const extra = 10000 - base * count
  return Array.from({ length: count }, (_, i) => formatPercentTotal(base + (i < extra ? 1 : 0)))
}
