import { useMemo } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { buildLedger } from '../domain/ledger'
import { useOverlay } from '../mock/overlayStore'
import { useGroup, useGroupBalances, useGroupMembers, useSharedExpenses } from './useGroups'

/** Real group data (Supabase) merged with the in-memory overlay. */
export function useGroupLedger(groupId: string | undefined) {
  const { user } = useAuth()
  const meId = user?.id ?? ''
  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const balances = useGroupBalances(groupId)
  const expenses = useSharedExpenses(groupId)
  const overlay = useOverlay(groupId)

  const ledger = useMemo(
    () =>
      buildLedger({
        meId,
        members: members.data ?? [],
        balances: balances.data ?? [],
        expenses: expenses.data ?? [],
        overlay,
      }),
    [meId, members.data, balances.data, expenses.data, overlay],
  )

  const name = overlay.name ?? group.data?.name ?? ''
  return {
    meId,
    group,
    members,
    balances,
    expenses,
    overlay,
    ledger,
    name,
    isLoading: group.isLoading || members.isLoading,
    isError: group.isError || members.isError,
  }
}
