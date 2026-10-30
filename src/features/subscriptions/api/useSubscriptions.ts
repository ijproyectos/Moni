import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import { remindersFor } from '../domain/subscription'
import { subscriptionKeys } from './queryKeys'
import {
  createSubscription,
  dismissDuplicate,
  getSubscriptionOverview,
  linkChargeToExpense,
  markChargeNotCharged,
  processMyDueSubscriptions,
  setSubscriptionStatus,
  updateSubscription,
  type SubscriptionInput,
} from './subscriptionsRepository'

export function useSubscriptions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: subscriptionKeys.overview(user?.id),
    enabled: Boolean(user),
    queryFn: getSubscriptionOverview,
  })
}

/** Reminders for tomorrow's charges ("Mañana se cobra Netflix…"). Empty while loading or if unavailable. */
export function useSubscriptionReminders() {
  const { data } = useSubscriptions()
  return data ? remindersFor(data.subscriptions, data.today) : []
}

// A charge changes balances, movements and the month summary as well as the subscription lists.
function useInvalidateEverything() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
    ])
}

/**
 * Safety net for the scheduled job: when the app opens, register what is already due for this person.
 * Idempotent on the server. Quiet on failure (the job still does the work).
 */
export function useSyncDueSubscriptions() {
  const { user } = useAuth()
  const invalidate = useInvalidateEverything()
  const online = useOnlineStatus()
  const ran = useRef<string | null>(null)
  useEffect(() => {
    // Offline: skip quietly and run once the connection is back.
    if (!user || !online || ran.current === user.id) return
    ran.current = user.id
    processMyDueSubscriptions()
      .then((registered) => (registered > 0 ? invalidate() : undefined))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in user
  }, [user, online])
}

export function useCreateSubscription() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ input, requestKey }: { input: SubscriptionInput; requestKey: string }) =>
      createSubscription(input, requestKey),
    // A first charge dated today is registered right away, not at the next job run.
    onSuccess: async () => {
      await processMyDueSubscriptions().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useUpdateSubscription() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubscriptionInput }) =>
      updateSubscription(id, input),
    onSuccess: async () => {
      await processMyDueSubscriptions().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useSetSubscriptionStatus() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' | 'cancelled' }) =>
      setSubscriptionStatus(id, status),
    onSuccess: async (_data, { status }) => {
      if (status === 'active') await processMyDueSubscriptions().catch(() => undefined)
      await invalidate()
    },
  })
}

export function useMarkChargeNotCharged() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: markChargeNotCharged, onSuccess: invalidate })
}

export function useLinkChargeToExpense() {
  const invalidate = useInvalidateEverything()
  return useMutation({
    mutationFn: ({ chargeId, transactionId }: { chargeId: string; transactionId: string }) =>
      linkChargeToExpense(chargeId, transactionId),
    onSuccess: invalidate,
  })
}

export function useDismissDuplicate() {
  const invalidate = useInvalidateEverything()
  return useMutation({ mutationFn: dismissDuplicate, onSuccess: invalidate })
}
