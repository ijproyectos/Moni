import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import {
  ACTIVATION_BACKOFF_MS,
  isActivated,
  thanksPhase,
  type ThanksPhase,
} from '../domain/billing'
import { clearCheckoutMarker, readCheckoutBaseline } from './checkoutMarker'
import { plusKeys } from './queryKeys'
import { useSubscriptionState } from './useBilling'
import { usePlusStatus } from './usePlus'

/**
 * Return page logic. On mount it refreshes the Plus status and the subscription, then re-checks the Plus status on a
 * growing delay (see ACTIVATION_BACKOFF_MS). Plus is granted by the Mercado Pago webhook, which can lag the redirect:
 * after the last check the phase becomes `delayed` and the page says activation can take a few minutes.
 */
export function useActivationWatch(): { phase: ThanksPhase; retry: () => void } {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const status = usePlusStatus()
  const subscription = useSubscriptionState()
  const [attempt, setAttempt] = useState(0)
  // Read once: what Plus end date they had before paying (undefined when unknown).
  const baseline = useRef(user ? readCheckoutBaseline(user.id) : undefined)

  const activated = isActivated(baseline.current, status.data)

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: plusKeys.all(user?.id) })
  }, [queryClient, user?.id])

  useEffect(() => {
    if (activated) clearCheckoutMarker()
  }, [activated])

  useEffect(() => {
    if (activated || attempt >= ACTIVATION_BACKOFF_MS.length) return
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: plusKeys.status(user?.id) })
      setAttempt((a) => a + 1)
    }, ACTIVATION_BACKOFF_MS[attempt])
    return () => clearTimeout(timer)
  }, [activated, attempt, queryClient, user?.id])

  const phase = thanksPhase({
    statusLoading: status.isLoading,
    statusFailed: status.isError && !status.data,
    activated,
    subscription: subscription.data,
    attempt,
  })

  return {
    phase,
    retry: () => {
      setAttempt(0)
      void queryClient.invalidateQueries({ queryKey: plusKeys.all(user?.id) })
    },
  }
}
