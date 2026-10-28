import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import type { TransactionFormValues, TransferFormValues } from '../domain/transaction'
import { transactionKeys, type TransactionQueryFilters } from './queryKeys'
import {
  createTransaction,
  createTransfer,
  listTransactions,
  listTransfers,
  updateTransaction,
  voidTransaction,
  voidTransfer,
} from './transactionsRepository'

/** Posted movements matching the server-side filters. Use `filterTransactions` for text search. */
export function useTransactions(filters: TransactionQueryFilters = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: transactionKeys.list(user?.id, filters),
    enabled: Boolean(user),
    queryFn: () => listTransactions(filters),
  })
}

export function useTransfers(range: { from?: string; to?: string } = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: transactionKeys.transfers(user?.id, range),
    enabled: Boolean(user),
    queryFn: () => listTransfers(range),
  })
}

// Any money movement changes balances and the month summary, so all three caches go stale.
function useInvalidateMoney() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
    ])
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (values: TransactionFormValues) => createTransaction(values),
    onSuccess: invalidate,
  })
}

export type CreateManyResult = { key: string } & ({ ok: true } | { ok: false; error: unknown })

/**
 * Saves several movements one after another (confirmed AI drafts). A failure does not stop the rest:
 * every item reports its own result so the UI can keep only the ones that failed.
 */
export function useCreateTransactions() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (
      items: readonly { key: string; values: TransactionFormValues }[],
    ): Promise<CreateManyResult[]> => {
      const results: CreateManyResult[] = []
      for (const item of items) {
        try {
          await createTransaction(item.values)
          results.push({ key: item.key, ok: true })
        } catch (error) {
          results.push({ key: item.key, ok: false, error })
        }
      }
      return results
    },
    onSettled: invalidate,
  })
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Omit<TransactionFormValues, 'kind'> }) =>
      updateTransaction(id, values),
    onSuccess: invalidate,
  })
}

export function useVoidTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => voidTransaction(id),
    onSuccess: invalidate,
  })
}

export function useCreateTransfer() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (values: TransferFormValues) => createTransfer(values),
    onSuccess: invalidate,
  })
}

export function useVoidTransfer() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (id: string) => voidTransfer(id),
    onSuccess: invalidate,
  })
}
