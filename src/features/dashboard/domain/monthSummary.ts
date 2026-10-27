import { z } from 'zod'
import { toCents, type Cents } from '@/shared/lib/money'

// Shape returned by public.get_month_summary. Amounts arrive as JSON numbers and become cents here.
const cents = z.number().transform((value) => toCents(value))

const rawSummarySchema = z.object({
  income: cents,
  expense: cents,
  balance: cents,
  available_balance: cents,
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
  recent: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      amount: cents,
      occurred_on: z.string(),
      note: z.string().nullable(),
      account_id: z.string(),
      account_name: z.string(),
      category_name: z.string().nullable(),
      category_color: z.string().nullable(),
      category_icon: z.string().nullable(),
    }),
  ),
})

export interface CategorySlice {
  categoryId: string
  name: string
  color: string
  icon: string
  amountCents: Cents
  percent: number
}

/**
 * Shares of group expenses come back as virtual categories (`template:<slug>`, `template:none`) that have
 * no row in `categories`: they render from the payload but cannot be used to filter or drill down.
 */
export function isVirtualCategoryId(categoryId: string): boolean {
  return categoryId.startsWith('template:')
}

export interface DailyTotal {
  day: string
  expenseCents: Cents
  incomeCents: Cents
}

export interface RecentMovement {
  id: string
  kind: string
  amountCents: Cents
  occurredOn: string
  note: string | null
  accountId: string
  accountName: string
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
}

export interface MonthSummary {
  incomeCents: Cents
  expenseCents: Cents
  balanceCents: Cents
  /** Sum of active ARS account balances, independent of the selected month. */
  availableBalanceCents: Cents
  byCategory: CategorySlice[]
  /** Only days with activity. */
  daily: DailyTotal[]
  recent: RecentMovement[]
}

export function parseMonthSummary(payload: unknown): MonthSummary {
  const raw = rawSummarySchema.parse(payload)
  return {
    incomeCents: raw.income,
    expenseCents: raw.expense,
    balanceCents: raw.balance,
    availableBalanceCents: raw.available_balance,
    byCategory: raw.by_category.map((c) => ({
      categoryId: c.category_id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      amountCents: c.amount,
      percent: c.percent ?? 0,
    })),
    daily: raw.daily.map((d) => ({ day: d.day, expenseCents: d.expense, incomeCents: d.income })),
    recent: raw.recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCents: r.amount,
      occurredOn: r.occurred_on,
      note: r.note,
      accountId: r.account_id,
      accountName: r.account_name,
      categoryName: r.category_name,
      categoryColor: r.category_color,
      categoryIcon: r.category_icon,
    })),
  }
}
