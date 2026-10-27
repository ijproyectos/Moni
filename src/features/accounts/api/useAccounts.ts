import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import type { AccountFormValues } from '../domain/account'
import {
  createAccount,
  listAccounts,
  setAccountArchived,
  updateAccount,
} from './accountsRepository'
import { accountKeys } from './queryKeys'

/** Accounts with derived balances. Archived accounts are hidden unless requested. */
export function useAccounts(options: { includeArchived?: boolean } = {}) {
  const { user } = useAuth()
  const includeArchived = options.includeArchived ?? false

  return useQuery({
    queryKey: accountKeys.list(user?.id, includeArchived),
    enabled: Boolean(user),
    queryFn: () => listAccounts(includeArchived),
  })
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
    ])
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: (values: AccountFormValues) => createAccount(values),
    onSuccess: invalidate,
  })
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: AccountFormValues }) =>
      updateAccount(id, values),
    onSuccess: invalidate,
  })
}

export function useArchiveAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: ({ id, archived = true }: { id: string; archived?: boolean }) =>
      setAccountArchived(id, archived),
    onSuccess: invalidate,
  })
}
