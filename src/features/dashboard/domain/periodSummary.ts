import { z } from 'zod'
import { toCents, type Cents } from '@/shared/lib/money'
import type { CategorySlice, DailyTotal } from './monthSummary'

// Shape returned by public.get_period_summary: the month summary totals/by_category/daily for a date range.
const cents = z.number().transform((value) => toCents(value))

const rawPeriodSchema = z.object({
  income: cents,
  expense: cents,
  balance: cents,
  by_category: z.array(
    z.object({
      category_id: z.string(),
      name: z.string(),
      color: z.string(),
      icon: z.string(),
      amount: cents,
      percent: z.number().nullable(),
    }),
  ),
  daily: z.array(z.object({ day: z.string(), expense: cents, income: cents })),
})

export interface PeriodSummary {
  incomeCents: Cents
  expenseCents: Cents
  balanceCents: Cents
  byCategory: CategorySlice[]
  /** Only days with activity. */
  daily: DailyTotal[]
}

export function parsePeriodSummary(payload: unknown): PeriodSummary {
  const raw = rawPeriodSchema.parse(payload)
  return {
    incomeCents: raw.income,
    expenseCents: raw.expense,
    balanceCents: raw.balance,
    byCategory: raw.by_category.map((c) => ({
      categoryId: c.category_id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      amountCents: c.amount,
      percent: c.percent ?? 0,
    })),
    daily: raw.daily.map((d) => ({ day: d.day, expenseCents: d.expense, incomeCents: d.income })),
  }
}
