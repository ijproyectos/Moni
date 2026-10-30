import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import {
  cancelSubscription,
  createCheckout,
  getSubscriptionState,
  reactivateSubscription,
} from './billingRepository'
import { saveCheckoutMarker } from './checkoutMarker'
import { plusKeys } from './queryKeys'

/** State of the person's Mercado Pago subscription (none / pending / authorized / paused / cancelled). */
export function useSubscriptionState() {
  const { user } = useAuth()
  return useQuery({
    queryKey: plusKeys.subscription(user?.id),
    enabled: Boolean(user),
    queryFn: getSubscriptionState,
    staleTime: 30_000,
  })
}

const goTo = (url: string) => window.location.assign(url)

/**
 * "Suscribirme": creates the subscription on the server, remembers the pre-checkout Plus end date and sends the
 * browser to Mercado Pago. `navigate` is injectable for tests.
 */
export function useStartCheckout(navigate: (url: string) => void = goTo) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: createCheckout,
    onSuccess: (initPoint) => {
      if (user) {
        const known = queryClient.getQueryData<string | null>(plusKeys.status(user.id))
        if (known !== undefined) saveCheckoutMarker(user.id, known)
      }
      navigate(initPoint)
    },
  })
}

function useLifecycle(mutationFn: () => ReturnType<typeof cancelSubscription>) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn,
    onSuccess: (state) => {
      queryClient.setQueryData(plusKeys.subscription(user?.id), state)
      return queryClient.invalidateQueries({ queryKey: plusKeys.subscription(user?.id) })
    },
  })
}

/** Cancel keeps Plus until the paid expiry, so the Plus status is deliberately NOT touched. */
export const useCancelSubscription = () => useLifecycle(cancelSubscription)
export const useReactivateSubscription = () => useLifecycle(reactivateSubscription)
