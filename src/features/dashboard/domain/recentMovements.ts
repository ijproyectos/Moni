import type { Category } from '@/features/categories/domain/category'
import { isScheduled, type Transaction } from '@/features/transactions/domain/transaction'
import type { IsoDate } from '@/shared/lib/month'
import type { RecentMovement } from './monthSummary'

/**
 * The newest executed movements across the whole history (not one month), shaped like the month summary's `recent`
 * so Inicio renders both the same way. Scheduled installments stay out: they have not happened yet.
 */
export function buildRecentMovements(input: {
  transactions: readonly Transaction[]
  categoriesById: ReadonlyMap<string, Category>
  accountNamesById: ReadonlyMap<string, string>
  today: IsoDate
  limit: number
}): RecentMovement[] {
  const { transactions, categoriesById, accountNamesById, today, limit } = input
  return transactions
    .filter((tx) => tx.status === 'posted' && !isScheduled(tx, today))
    .sort(
      (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, limit)
    .map((tx) => {
      const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined
      return {
        id: tx.id,
        kind: tx.kind,
        amountCents: tx.amountCents,
        occurredOn: tx.occurredOn,
        note: tx.note,
        accountId: tx.accountId,
        accountName: accountNamesById.get(tx.accountId) ?? 'Cuenta',
        categoryName: category?.name ?? null,
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
      }
    })
}

export interface MovementMonthGroup {
  /** First day of the month, `YYYY-MM-01`. */
  month: IsoDate
  movements: RecentMovement[]
}

/** Splits movements (already newest first) into one group per month, keeping their order. */
export function groupMovementsByMonth(movements: readonly RecentMovement[]): MovementMonthGroup[] {
  const groups: MovementMonthGroup[] = []
  for (const movement of movements) {
    const month = `${movement.occurredOn.slice(0, 7)}-01`
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.movements.push(movement)
    else groups.push({ month, movements: [movement] })
  }
  return groups
}
