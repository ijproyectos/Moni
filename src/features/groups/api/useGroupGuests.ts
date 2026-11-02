import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import {
  emptyOverlay,
  useOverlays as useLocalOverlays,
  type GroupOverlay,
} from '../mock/overlayStore'
import {
  addGroupGuest,
  createGuestExpense,
  createGuestSettlement,
  EMPTY_GUEST_STATE,
  linkGroupGuest,
  listGuestState,
  removeGroupGuest,
  updateGroupGuest,
  voidGuestExpense,
  voidGuestSettlement,
  type GuestExpenseInput,
  type GuestStateByGroup,
} from './guestsRepository'
import { groupKeys } from './queryKeys'

const NONE: GuestStateByGroup = {}

/** People without an account and the records that involve them, for every group of the person. */
export function useGuestState() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.guests(user?.id),
    enabled: Boolean(user),
    queryFn: listGuestState,
    // Until the migration exists (or while offline) the groups keep working with their own data.
    retry: false,
  })
}

/**
 * What the app knows beyond the shared tables of each group: the local-only settings (name, couple split…) plus
 * the stored guests, expenses and settlements that involve people without an account.
 */
export function useGroupOverlays(): Record<string, GroupOverlay> {
  const local = useLocalOverlays()
  const stored = useGuestState().data ?? NONE
  return useMemo(() => {
    const merged: Record<string, GroupOverlay> = {}
    for (const id of new Set([...Object.keys(local), ...Object.keys(stored)])) {
      merged[id] = { ...(local[id] ?? emptyOverlay()), ...(stored[id] ?? EMPTY_GUEST_STATE) }
    }
    return merged
  }, [local, stored])
}

const EMPTY = emptyOverlay()

export function useGroupOverlay(groupId: string | undefined): GroupOverlay {
  const all = useGroupOverlays()
  return (groupId && all[groupId]) || EMPTY
}

function useInvalidate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      // Editing or converting an expense also changes the person's own movements and Inicio.
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
    ])
}

export function useAddGuest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ groupId, name, alias }: { groupId: string; name: string; alias: string }) =>
      addGroupGuest(groupId, name, alias),
    onSuccess: invalidate,
  })
}

export function useUpdateGuest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ guestId, name, alias }: { guestId: string; name: string; alias: string }) =>
      updateGroupGuest(guestId, name, alias),
    onSuccess: invalidate,
  })
}

export function useRemoveGuest() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: removeGroupGuest, onSuccess: invalidate })
}

export function useLinkGuest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ guestId, userId }: { guestId: string; userId: string }) =>
      linkGroupGuest(guestId, userId),
    onSuccess: invalidate,
  })
}

export function useCreateGuestExpense() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      groupId,
      expense,
      replaces,
    }: {
      groupId: string
      expense: GuestExpenseInput
      replaces?: Parameters<typeof createGuestExpense>[2]
    }) => createGuestExpense(groupId, expense, replaces),
    onSuccess: invalidate,
  })
}

export function useVoidGuestExpense() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: voidGuestExpense, onSuccess: invalidate })
}

export function useVoidGuestSettlement() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: voidGuestSettlement, onSuccess: invalidate })
}

export function useCreateGuestSettlement() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      groupId,
      settlement,
    }: {
      groupId: string
      settlement: Parameters<typeof createGuestSettlement>[1]
    }) => createGuestSettlement(groupId, settlement),
    onSuccess: invalidate,
  })
}
