import type { Cents } from '@/shared/lib/money'
import type { Transaction } from './transaction'

export interface RepeatSuggestion {
  /** Stable key: what makes two movements "the same one". */
  key: string
  /** What the chip says ("Café"): the note, or the category name when there is none. */
  label: string
  amountCents: Cents
  accountId: string
  categoryId: string | null
  note: string | null
}

export const MAX_REPEAT_SUGGESTIONS = 4

/**
 * Recent expenses worth repeating, from the person's own movements: posted personal expenses (no card installments,
 * no trips), grouped by note + category so each suggestion is distinct, ordered by how often they happened and then by
 * how recent they are. The amount and account are those of the latest one of each group.
 */
export function recentRepeats(
  transactions: readonly Transaction[],
  categoryNameById: ReadonlyMap<string, string> = new Map(),
  limit = MAX_REPEAT_SUGGESTIONS,
): RepeatSuggestion[] {
  const groups = new Map<string, { latest: Transaction; count: number }>()
  for (const tx of transactions) {
    if (tx.kind !== 'expense' || tx.status !== 'posted') continue
    if (tx.installmentPlanId || tx.tripId || tx.sharedExpenseId || tx.guestExpenseId) continue
    const note = tx.note?.trim() ?? ''
    if (note === '' && !tx.categoryId) continue
    const key = `${note.toLowerCase()}|${tx.categoryId ?? ''}`
    const group = groups.get(key)
    if (!group) groups.set(key, { latest: tx, count: 1 })
    else {
      group.count += 1
      if (isNewer(tx, group.latest)) group.latest = tx
    }
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => b.count - a.count || (isNewer(a.latest, b.latest) ? -1 : 1))
    .slice(0, limit)
    .map(([key, { latest }]) => {
      const note = latest.note?.trim() ?? ''
      return {
        key,
        label: note !== '' ? note : (categoryNameById.get(latest.categoryId ?? '') ?? 'Gasto'),
        amountCents: latest.amountCents,
        accountId: latest.accountId,
        categoryId: latest.categoryId,
        note: note !== '' ? note : null,
      }
    })
}

function isNewer(a: Transaction, b: Transaction): boolean {
  return a.occurredOn !== b.occurredOn
    ? a.occurredOn > b.occurredOn
    : a.createdAt > b.createdAt
}
