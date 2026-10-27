import type { CategorySlice } from './monthSummary'

/** "Moni dice" line computed from the month's category totals; a friendly nudge when there is none. */
export function buildInsight(byCategory: readonly CategorySlice[]): string {
  const top = [...byCategory].sort((a, b) => b.amountCents - a.amountCents)[0]
  if (!top || top.amountCents <= 0) {
    return 'todavía no cargaste gastos este mes. Cuando sumes uno, te cuento en qué se te va la plata.'
  }
  return `tu mayor gasto del mes es ${top.name}, con el ${Math.round(top.percent)}% del total.`
}
