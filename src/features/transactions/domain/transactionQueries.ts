import type { Category } from '@/features/categories/domain/category'
import type { Cents } from '@/shared/lib/money'
import { daysInMonth, monthStart, type IsoDate } from '@/shared/lib/month'
import { countsInStatistics, signedAmount, type EntryKind, type Transaction } from './transaction'

export interface TransactionFilters {
  /** Case- and accent-insensitive match on note or category name. */
  search?: string
  kind?: EntryKind
  categoryIds?: readonly string[]
  accountId?: string
  /** Inclusive ISO dates. */
  from?: IsoDate
  to?: IsoDate
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
  categoriesById: ReadonlyMap<string, Category> = new Map(),
): Transaction[] {
  const search = filters.search ? normalize(filters.search) : ''

  return transactions.filter((tx) => {
    if (filters.kind && tx.kind !== filters.kind) return false
    if (filters.accountId && tx.accountId !== filters.accountId) return false
    if (
      filters.categoryIds?.length &&
      (!tx.categoryId || !filters.categoryIds.includes(tx.categoryId))
    )
      return false
    if (filters.from && tx.occurredOn < filters.from) return false
    if (filters.to && tx.occurredOn > filters.to) return false
    if (search) {
      const categoryName = tx.categoryId ? (categoriesById.get(tx.categoryId)?.name ?? '') : ''
      const haystack = normalize(`${tx.note ?? ''} ${categoryName}`)
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

export interface DayGroup {
  date: IsoDate
  /** Income minus expense for the day, posted statistics kinds only. */
  netCents: Cents
  items: Transaction[]
}

/** Groups by calendar day, newest day first. Within a day, the input order is kept. */
export function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const groups = new Map<IsoDate, DayGroup>()
  for (const tx of transactions) {
    const group = groups.get(tx.occurredOn) ?? { date: tx.occurredOn, netCents: 0, items: [] }
    group.items.push(tx)
    group.netCents += signedAmount(tx)
    groups.set(tx.occurredOn, group)
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export interface CalendarDayTotal {
  date: IsoDate
  expenseCents: Cents
  incomeCents: Cents
}

/** One entry per day of the month (including empty days), for the activity calendar. */
export function calendarDayTotals(
  transactions: readonly Transaction[],
  month: IsoDate,
): CalendarDayTotal[] {
  const start = monthStart(month)
  const prefix = start.slice(0, 7)
  const days: CalendarDayTotal[] = Array.from({ length: daysInMonth(start) }, (_, index) => ({
    date: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    expenseCents: 0,
    incomeCents: 0,
  }))

  for (const tx of transactions) {
    if (!countsInStatistics(tx) || !tx.occurredOn.startsWith(prefix)) continue
    const day = days[Number(tx.occurredOn.slice(8, 10)) - 1]
    if (!day) continue
    if (tx.kind === 'expense') day.expenseCents += tx.amountCents
    else day.incomeCents += tx.amountCents
  }
  return days
}

export function totalsOf(transactions: readonly Transaction[]): {
  incomeCents: Cents
  expenseCents: Cents
} {
  let incomeCents = 0
  let expenseCents = 0
  for (const tx of transactions) {
    if (!countsInStatistics(tx)) continue
    if (tx.kind === 'income') incomeCents += tx.amountCents
    else expenseCents += tx.amountCents
  }
  return { incomeCents, expenseCents }
}
