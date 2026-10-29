import type { Category } from '@/features/categories/domain/category'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { todayIso } from '@/shared/lib/month'
import {
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
