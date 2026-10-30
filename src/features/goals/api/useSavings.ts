import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { goalReminders, savingsAlerts, type SavingsOverview } from '../domain/savings'
import { savingsKeys } from './queryKeys'
import {
  addDeposit,
  createSavingsGoal,
  getSavingsOverview,
  setGoalStatus,
  skipReminder,
  snoozeReminder,
  updateSavingsGoal,
  voidMovement,
  withdrawReserve,
  type SavingsGoalInput,
} from './savingsRepository'

export function useSavings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: savingsKeys.overview(user?.id),
    enabled: Boolean(user),
    queryFn: getSavingsOverview,
  })
}

/** One alert per account whose balance no longer covers what its goals reserve. Empty while loading or unavailable. */
export function useSavingsAlerts() {
  const { data } = useSavings()
  return data ? savingsAlerts(data) : []
}

/** One reminder per goal that is due today (or still waiting for an answer). */
export function useGoalReminders() {
  const { data } = useSavings()
  return data ? goalReminders(data) : []
}

/**
 * A fresh read of the reserves right before a movement is confirmed (they may have changed since the screen
 * opened), used to warn when a spend, transfer or payment would leave an account under its reserved money.
 */
export function useFreshSavings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return async (): Promise<SavingsOverview | null> => {
    try {
      return await queryClient.fetchQuery({
        queryKey: savingsKeys.overview(user?.id),
        queryFn: getSavingsOverview,
        staleTime: 0,
      })
    } catch {
      return null
    }
  }
}

// Reserving money changes no balance, but the account lines, Inicio and the goals all show it.
function useInvalidateSavings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () => queryClient.invalidateQueries({ queryKey: savingsKeys.all(user?.id) })
}

export function useCreateSavingsGoal() {
  const invalidate = useInvalidateSavings()
  return useMutation({
    mutationFn: ({
      input,
      requestKey,
    }: {
      input: SavingsGoalInput & { initialCents: number | null }
      requestKey: string
    }) => createSavingsGoal(input, requestKey),
    onSuccess: invalidate,
  })
}

export function useUpdateSavingsGoal() {
  const invalidate = useInvalidateSavings()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SavingsGoalInput }) =>
      updateSavingsGoal(id, input),
    onSuccess: invalidate,
  })
}

export function useSetGoalStatus() {
  const invalidate = useInvalidateSavings()
  return useMutation({
    mutationFn: ({
      id,
      status,
      release,
    }: {
      id: string
      status: 'active' | 'paused' | 'completed' | 'archived'
      release?: boolean
    }) => setGoalStatus(id, status, release),
    onSuccess: invalidate,
  })
}

export function useAddDeposit() {
  const invalidate = useInvalidateSavings()
  return useMutation({ mutationFn: addDeposit, onSuccess: invalidate })
}

export function useWithdrawReserve() {
  const invalidate = useInvalidateSavings()
  return useMutation({ mutationFn: withdrawReserve, onSuccess: invalidate })
}

export function useVoidMovement() {
  const invalidate = useInvalidateSavings()
  return useMutation({ mutationFn: voidMovement, onSuccess: invalidate })
}

export function useSnoozeReminder() {
  const invalidate = useInvalidateSavings()
  return useMutation({
    mutationFn: ({ goalId, until }: { goalId: string; until: string }) =>
      snoozeReminder(goalId, until),
    onSuccess: invalidate,
  })
}

export function useSkipReminder() {
  const invalidate = useInvalidateSavings()
  return useMutation({ mutationFn: skipReminder, onSuccess: invalidate })
}

/** How many savings notices exist right now (one per compromised account plus one per due reminder). For the bell. */
export function useSavingsNoticeCount(): number {
  return useSavingsAlerts().length + useGoalReminders().length
}

/**
 * The person's real goals in the shape Aguinaldo reads them (names and progress only). Aguinaldo's split is still a
 * simulation: it shows these goals but never changes their reserves.
 */
export function useGoalNames() {
  const { data } = useSavings()
  return (data?.goals ?? [])
    .filter((g) => g.status === 'active')
    .map((g) => ({
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: g.reservedCents,
      shared: undefined,
    }))
}
