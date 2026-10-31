import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import type { ImportWindow } from '../domain/mpImport'
import {
  connectMp,
  dismissDuplicate,
  getConnection,
  getDuplicates,
  getSubscriptionSuggestions,
  getUnimportedCount,
  syncNow,
  unlinkMp,
} from './mpImportRepository'
import { mpImportKeys } from './queryKeys'

export function useMpConnection() {
  const { user } = useAuth()
  return useQuery({
    queryKey: mpImportKeys.connection(user?.id),
    enabled: Boolean(user),
    queryFn: getConnection,
  })
}

/** Duplicates and suggestions only matter while the account is linked, so the caller gates them with `enabled`. */
export function useMpDuplicates(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: mpImportKeys.duplicates(user?.id),
    enabled: Boolean(user) && enabled,
    queryFn: getDuplicates,
  })
}

export function useMpSuggestions(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: mpImportKeys.suggestions(user?.id),
    enabled: Boolean(user) && enabled,
    queryFn: getSubscriptionSuggestions,
  })
}

export function useMpUnimported(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: mpImportKeys.unimported(user?.id),
    enabled: Boolean(user) && enabled,
    queryFn: getUnimportedCount,
  })
}

const goTo = (url: string) => window.location.assign(url)

/** Starts the OAuth flow: asks the server for the URL and sends the browser to Mercado Pago. `navigate` is injectable. */
export function useConnectMp(navigate: (url: string) => void = goTo) {
  return useMutation({
    mutationFn: (window: ImportWindow) => connectMp(window),
    onSuccess: (url) => navigate(url),
  })
}

function useRefreshing<V = undefined>(mutationFn: (v: V) => Promise<void>) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mpImportKeys.all(user?.id) }),
  })
}

export const useUnlinkMp = () => useRefreshing(unlinkMp)
export const useSyncNow = () => useRefreshing(syncNow)
export const useDismissDuplicate = () => useRefreshing<string>(dismissDuplicate)
