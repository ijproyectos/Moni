// React Query glue for the RevenueCat (native-app) purchase flow. The ENTITLEMENT itself (is the person Plus right
// now) is already unified across Mercado Pago and RevenueCat in public.plus_entitlements, so usePlus() /
// useSubscriptionState() keep being the source of truth for "is Plus" — these hooks only drive the native purchase
// action and its own store-side state (RevenueCat's CustomerInfo), not a parallel "is Plus" concept.

import { Capacitor } from '@capacitor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import {
  configureRevenueCat,
  getNativeEntitlement,
  purchaseMonthlyPlus,
  restoreNativePurchases,
} from './revenueCat'
import { plusKeys } from './queryKeys'

/** Configures the RevenueCat SDK for the signed-in user. No-op on web or while there is no user. */
export function useConfigureRevenueCat() {
  const { user } = useAuth()
  useEffect(() => {
    if (user && Capacitor.isNativePlatform()) void configureRevenueCat(user.id)
  }, [user])
}

/** RevenueCat's own view of the subscription, used only to render the native purchase screen's state. */
export function useNativeEntitlement() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...plusKeys.all(user?.id), 'native'] as const,
    enabled: Boolean(user) && Capacitor.isNativePlatform(),
    queryFn: getNativeEntitlement,
    staleTime: 30_000,
  })
}

/**
 * Buys the monthly package through the store. On success, the server's entitlement (plus_entitlements) is updated
 * by revenuecat-webhook asynchronously — it can lag a few seconds behind the store confirming the purchase, same
 * as Mercado Pago's own webhook. invalidating here makes the next usePlus()/useNativeEntitlement() read pick it up
 * once it lands; a dedicated "thanks, activating…" polling screen (mirroring PlusThanksPage) is a later TODO.
 */
export function usePurchaseNativePlus() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: purchaseMonthlyPlus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plusKeys.all(user?.id) }),
  })
}

export function useRestoreNativePurchases() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: restoreNativePurchases,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plusKeys.all(user?.id) }),
  })
}
