import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import type { Cents } from '@/shared/lib/money'
import { monthStart, type IsoDate } from '@/shared/lib/month'
import {
  archiveBudget,
  createBudget,
  fetchBudgetStatus,
  fetchBudgetSuggestions,
  updateBudgetAmount,
} from './budgetsRepository'
import { budgetKeys } from './queryKeys'

/** Active budgets with what was spent in the month containing `month`. */
export function useBudgetStatus(month: IsoDate) {
  const { user } = useAuth()
  const first = monthStart(month)
  return useQuery({
    queryKey: budgetKeys.status(user?.id, first),
    enabled: Boolean(user),
    queryFn: () => fetchBudgetStatus(first),
  })
}

export function useBudgetSuggestions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: budgetKeys.suggestions(user?.id),
    enabled: Boolean(user),
    queryFn: fetchBudgetSuggestions,
  })
}

function useInvalidateBudgets() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // Status and suggestions sit under the dashboard prefix, so this refreshes both.
  return () => queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) })
}

export function useCreateBudget() {
  const invalidate = useInvalidateBudgets()
  return useMutation({
    mutationFn: ({ categoryId, amountCents }: { categoryId: string; amountCents: Cents }) =>
      createBudget(categoryId, amountCents),
    onSuccess: invalidate,
  })
}

export function useUpdateBudget() {
  const invalidate = useInvalidateBudgets()
  return useMutation({
    mutationFn: ({ id, amountCents }: { id: string; amountCents: Cents }) =>
      updateBudgetAmount(id, amountCents),
    onSuccess: invalidate,
  })
}

export function useArchiveBudget() {
  const invalidate = useInvalidateBudgets()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => archiveBudget(id),
    onSuccess: invalidate,
  })
}
