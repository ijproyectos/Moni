import type { Transaction } from '@/features/transactions/domain/transaction'
import { monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'

/**
 * Movements of the month (income or expense) that have no category. Only real income/expense movements count:
 * transfers and card payments live elsewhere.
 */
export function countUncategorized(
  transactions: readonly Pick<Transaction, 'kind' | 'status' | 'categoryId' | 'occurredOn'>[],
  month: IsoDate,
): number {
  const from = monthStart(month)
  const next = shiftMonth(from, 1)
  return transactions.filter(
    (t) =>
      t.status === 'posted' &&
      (t.kind === 'expense' || t.kind === 'income') &&
      t.categoryId === null &&
      t.occurredOn >= from &&
      t.occurredOn < next,
  ).length
}
