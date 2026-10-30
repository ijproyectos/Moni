import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { isPlusActive } from '../domain/plus'
import { getPlusExpiry, redeemPromoCode } from './plusRepository'
import { plusKeys } from './queryKeys'

/** Raw plan status: `data` is the Plus end date (ISO) or null on Free. Cached per user. */
export function usePlusStatus() {
  const { user } = useAuth()
  return useQuery({
    queryKey: plusKeys.status(user?.id),
    enabled: Boolean(user),
    queryFn: getPlusExpiry,
  })
}

export interface PlusState {
  isLoading: boolean
  /** Plus is running right now. */
  isPlus: boolean
  /**
   * The server answered and the person is on Free. False while loading or when the status could not be read
   * (offline): the UI then lets the action through and the server decides. The client gate is only UX.
   */
  isFree: boolean
  expiresAt: string | null
}

export function usePlus(): PlusState {
  const query = usePlusStatus()
  const expiresAt = query.data ?? null
  const isPlus = isPlusActive(expiresAt)
  return {
    isLoading: query.isLoading,
    isPlus,
    isFree: query.isSuccess && !isPlus,
    expiresAt,
  }
}

export function useRedeemPromoCode() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (code: string) => redeemPromoCode(code),
    onSuccess: (expiresAt) => {
      queryClient.setQueryData(plusKeys.status(user?.id), expiresAt)
      return queryClient.invalidateQueries({ queryKey: plusKeys.all(user?.id) })
    },
  })
}
