import type { Category } from '@/features/categories/domain/category'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { todayIso } from '@/shared/lib/month'
import {
  addsToBalance,
  isAdjustment,
  isOpening,
  isScheduled,
  signedAmount,
  type EntryKind,
  type Transaction,
  type Transfer,
} from './transaction'
import { filterTransactions } from './transactionQueries'

export type ActivityEntry =
  | { type: 'transaction'; id: string; occurredOn: IsoDate; transaction: Transaction }
  | { type: 'transfer'; id: string; occurredOn: IsoDate; transfer: Transfer }

export interface ActivityDay {
  date: IsoDate
  /** Income minus expense that already happened. Transfers and scheduled installments never count. */
  netCents: Cents
  /** Installments of the day still to come (a positive amount); they are scheduled, not executed. */
  scheduledCents: Cents
  entries: ActivityEntry[]
}

export interface ActivityFilters {
  search: string
  kind: 'all' | EntryKind
  categoryId: string | null
  day: IsoDate | null
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Transactions and transfers of a month merged into day groups (newest first) after applying the filters. */
export function buildActivity(input: {
  transactions: readonly Transaction[]
  transfers: readonly Transfer[]
  filters: ActivityFilters
  categoriesById: ReadonlyMap<string, Category>
  accountNamesById: ReadonlyMap<string, string>
  /** Defaults to today; passed in tests. */
  today?: IsoDate
}): ActivityDay[] {
  const { transactions, transfers, filters, categoriesById, accountNamesById } = input
  const today = input.today ?? todayIso()

  const matchingTransactions = filterTransactions(
    transactions,
    {
      search: filters.search,
      kind: filters.kind === 'all' ? undefined : filters.kind,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
    },
    categoriesById,
  ).filter((tx) => !filters.day || tx.occurredOn === filters.day)

  const search = normalize(filters.search)
  const includeTransfers = filters.kind === 'all' && filters.categoryId === null
  const matchingTransfers = includeTransfers
    ? transfers.filter((tr) => {
        if (filters.day && tr.occurredOn !== filters.day) return false
        if (!search) return true
        const haystack = normalize(
          `transferencia ${tr.note ?? ''} ${accountNamesById.get(tr.fromAccountId) ?? ''} ${accountNamesById.get(tr.toAccountId) ?? ''}`,
        )
        return haystack.includes(search)
      })
    : []

  const days = new Map<IsoDate, ActivityDay>()
  const dayOf = (date: IsoDate) => {
    const existing = days.get(date)
    if (existing) return existing
    const created: ActivityDay = { date, netCents: 0, scheduledCents: 0, entries: [] }
    days.set(date, created)
    return created
  }

  for (const transaction of matchingTransactions) {
    const day = dayOf(transaction.occurredOn)
    day.entries.push({
      type: 'transaction',
      id: transaction.id,
      occurredOn: transaction.occurredOn,
      transaction,
    })
    if (isScheduled(transaction, today)) day.scheduledCents += transaction.amountCents
    else day.netCents += signedAmount(transaction)
  }
  for (const transfer of matchingTransfers) {
    dayOf(transfer.occurredOn).entries.push({
      type: 'transfer',
      id: transfer.id,
      occurredOn: transfer.occurredOn,
      transfer,
    })
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function countEntries(days: readonly ActivityDay[]): number {
  return days.reduce((sum, d) => sum + d.entries.length, 0)
}

export type CategoryGroupType = 'category' | 'uncategorized' | 'opening' | 'adjustment' | 'transfer'

export interface CategoryGroup {
  /** Category id, or the bucket name for kinds without a category. Stable React key. */
  key: string
  type: CategoryGroupType
  /** Set only for `type: 'category'`. */
  category: Category | undefined
  label: string
  count: number
  /** Magnitude of the group (always >= 0); the sort key. */
  totalCents: Cents
  /** Whether the group takes money out, puts it in, or is neutral (transfers, offsetting adjustments). */
  direction: 'in' | 'out' | 'neutral'
  /** Newest first, as received. */
  entries: ActivityEntry[]
}

const BUCKET_LABELS: Record<Exclude<CategoryGroupType, 'category'>, string> = {
  uncategorized: 'Sin categoría',
  opening: 'Saldo inicial',
  adjustment: 'Ajustes de saldo',
  transfer: 'Transferencias',
}

function bucketOf(
  entry: ActivityEntry,
  categoriesById: ReadonlyMap<string, Category>,
): { key: string; type: CategoryGroupType; category: Category | undefined } {
  if (entry.type === 'transfer') return { key: 'transfer', type: 'transfer', category: undefined }
  const { kind, categoryId } = entry.transaction
  if (isOpening(kind)) return { key: 'opening', type: 'opening', category: undefined }
  if (isAdjustment(kind)) return { key: 'adjustment', type: 'adjustment', category: undefined }
  const category = categoryId ? categoriesById.get(categoryId) : undefined
  if (!category) return { key: 'uncategorized', type: 'uncategorized', category: undefined }
  return { key: category.id, type: 'category', category }
}

/**
 * Groups already-filtered activity days by category (expenses and incomes by their category; opening
 * balance, adjustments, transfers and uncategorized movements in dedicated buckets). Groups are
 * sorted by total, largest first; ties fall back to the label so the order is deterministic.
 */
export function groupByCategory(
  days: readonly ActivityDay[],
  categoriesById: ReadonlyMap<string, Category>,
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup & { netCents: Cents }>()
  for (const day of days) {
    for (const entry of day.entries) {
      const { key, type, category } = bucketOf(entry, categoriesById)
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          type,
          category,
          label: category ? category.name : BUCKET_LABELS[type as keyof typeof BUCKET_LABELS],
          count: 0,
          totalCents: 0,
          direction: 'neutral',
          entries: [],
          netCents: 0,
        }
        groups.set(key, group)
      }
      group.count += 1
      group.entries.push(entry)
      if (entry.type === 'transfer') group.netCents += entry.transfer.amountCents
      else {
        const { kind, amountCents } = entry.transaction
        group.netCents += addsToBalance(kind) ? amountCents : -amountCents
      }
    }
  }
  return [...groups.values()]
    .map(({ netCents, ...group }): CategoryGroup => {
      const transfer = group.type === 'transfer'
      return {
        ...group,
        totalCents: Math.abs(netCents),
        direction: transfer || netCents === 0 ? 'neutral' : netCents > 0 ? 'in' : 'out',
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.label.localeCompare(b.label, 'es'))
}
