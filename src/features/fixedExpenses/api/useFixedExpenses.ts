import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import { fixedReminders } from '../domain/fixedExpense'
import { fixedKeys } from './queryKeys'
import {
  correctPayment,
  createFixedExpense,
  findDuplicates,
  getFixedExpenseOverview,
  linkExistingExpense,
  processMyFixedExpenses,
  registerPayment,
  rescheduleOccurrence,
  setFixedExpenseStatus,
  skipOccurrence,
  updateFixedExpense,
  voidPayment,
  type FixedExpenseInput,
} from './fixedExpensesRepository'

export function useFixedExpenses() {
  const { user } = useAuth()
  return useQuery({
    queryKey: fixedKeys.overview(user?.id),
    enabled: Boolean(user),
    queryFn: getFixedExpenseOverview,
  })
}

/** Reminders for bills due today or tomorrow. Empty while loading or if unavailable. */
export function useFixedExpenseReminders() {
  const { data } = useFixedExpenses()
  return data ? fixedReminders(data) : []
}

// A payment changes balances, movements and the month summary as well as the fixed expense lists.
function useInvalidateEverything() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: fixedKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
    ])
}

/**
 * When the app opens, turn the due dates that have arrived into pending bills (no scheduled job is involved and no
 * money moves). Idempotent on the server. Quiet on failure.
 */
export function useSyncFixedExpenses() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const ran = useRef<string | null>(null)
  useEffect(() => {
    if (!user || ran.current === user.id) return
    ran.current = user.id
    processMyFixedExpenses()
      .then((created) =>
        created > 0
          ? queryClient.invalidateQueries({ queryKey: fixedKeys.all(user.id) })
          : undefined,
      )
      .catch(() => undefined)
  }, [user, queryClient])
}

/** Candidates for "Ya lo cargué", looked up for the amount, date and account being typed. */
export function useDuplicateCandidates(input: {
  occurrenceId: string
  amountCents: number
  paidOn: string
  accountId: string
  enabled: boolean
}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: fixedKeys.duplicates(
      user?.id,
      input.occurrenceId,
      input.amountCents,
      input.paidOn,
      input.accountId,
    ),
    enabled: Boolean(user) && input.enabled && input.amountCents > 0 && input.accountId !== '',
    queryFn: () => findDuplicates(input),
    staleTime: 0,
  })
}

export function useCreateFixedExpense() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ input, requestKey }: { input: FixedExpenseInput; requestKey: string }) =>
      createFixedExpense(input, requestKey),
    // A bill that is already due appears as pending right away.
    onSuccess: async () => {
      await processMyFixedExpenses().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useUpdateFixedExpense() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FixedExpenseInput }) =>
      updateFixedExpense(id, input),
    onSuccess: async () => {
      await processMyFixedExpenses().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useSetFixedExpenseStatus() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' | 'removed' }) =>
      setFixedExpenseStatus(id, status),
    onSuccess: async (_d, { status }) => {
      if (status === 'active') await processMyFixedExpenses().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useRegisterPayment() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: registerPayment, onSuccess: invalidate })
}

export function useLinkExistingExpense() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({
      occurrenceId,
      transactionId,
    }: {
      occurrenceId: string
      transactionId: string
    }) => linkExistingExpense(occurrenceId, transactionId),
    onSuccess: invalidate,
  })
}

export function useSkipOccurrence() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: skipOccurrence, onSuccess: invalidate })
}

export function useRescheduleOccurrence() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ occurrenceId, newDate }: { occurrenceId: string; newDate: string }) =>
      rescheduleOccurrence(occurrenceId, newDate),
    onSuccess: invalidate,
  })
}

export function useVoidPayment() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: voidPayment, onSuccess: invalidate })
}

export function useCorrectPayment() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: correctPayment, onSuccess: invalidate })
}
