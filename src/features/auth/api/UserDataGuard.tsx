import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { clearUserData } from './authActions'
import { useAuth } from './authContext'

/**
 * Wipes cached and per-user local data whenever the authenticated user id changes (sign-out from
 * any tab, token expiry, account switch), so one account never sees another's data.
 */
export function UserDataGuard() {
  const queryClient = useQueryClient()
  const { user, isLoading } = useAuth()
  const userId = user?.id ?? null
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (previous.current !== null && previous.current !== userId) clearUserData(queryClient)
    previous.current = userId
  }, [isLoading, userId, queryClient])

  return null
}
