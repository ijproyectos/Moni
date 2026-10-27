import type { TransactionFilters } from '../domain/transactionQueries'

/** Server-side filters only; free-text search runs client-side over the fetched rows. */
export type TransactionQueryFilters = Omit<TransactionFilters, 'search'>

export const transactionKeys = {
  all: (userId: string | undefined) => ['transactions', userId] as const,
  list: (userId: string | undefined, filters: TransactionQueryFilters) =>
    [
      'transactions',
      userId,
      'list',
      { ...filters, categoryIds: filters.categoryIds ? [...filters.categoryIds].sort() : null },
    ] as const,
  transfers: (userId: string | undefined, range: { from?: string; to?: string }) =>
    ['transactions', userId, 'transfers', range] as const,
}
