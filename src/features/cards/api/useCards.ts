import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import type { IsoDate } from '@/shared/lib/month'
import {
  createInstallmentPurchase,
  getCardOverview,
  listInstallmentPlanRows,
  listStatementItems,
  voidInstallmentPlan,
  type InstallmentPurchaseInput,
} from './cardsRepository'
import { cardKeys } from './queryKeys'

export function useCardOverview(accountId: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: cardKeys.overview(user?.id, accountId),
    enabled: Boolean(user) && enabled,
    queryFn: () => getCardOverview(accountId),
  })
}

export function useStatementItems(accountId: string, closingOn: IsoDate | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: cardKeys.statementItems(user?.id, accountId, closingOn ?? ''),
    enabled: Boolean(user) && closingOn !== null,
    queryFn: () => listStatementItems(accountId, closingOn as IsoDate),
  })
}

export function useInstallmentPlanRows() {
  const { user } = useAuth()
  return useQuery({
    queryKey: cardKeys.plans(user?.id),
    enabled: Boolean(user),
    queryFn: listInstallmentPlanRows,
  })
}

// A plan changes debt, balances, month reports and the movement list: all of it goes stale.
function useInvalidateMoney() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
    ])
}

export function useCreateInstallmentPurchase() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (input: InstallmentPurchaseInput) => createInstallmentPurchase(input),
    onSuccess: invalidate,
  })
}

export function useVoidInstallmentPlan() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: (planId: string) => voidInstallmentPlan(planId),
    onSuccess: invalidate,
  })
}
