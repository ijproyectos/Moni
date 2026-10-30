import { useQueries } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { summarizeDebts, type DebtSummary, type GroupLedgerEntry } from '../domain/debtSummary'
import { buildLedger } from '../domain/ledger'
import { emptyOverlay, useOverlays } from '../mock/overlayStore'
import { getGroupBalances, listGroupMembers } from './groupsRepository'
import { groupKeys } from './queryKeys'

/**
 * Who owes me / whom I owe across the given groups. Reuses the per-group members and balances queries (same
 * keys as the group detail) and the ledger's own transfers, so no balance math is duplicated.
 */
export function useDebtSummary(
  groups: readonly { id: string; name: string }[],
  enabled: boolean,
): { summary: DebtSummary; isLoading: boolean; isError: boolean } {
  const { user } = useAuth()
  const overlays = useOverlays()
  const meId = user?.id ?? ''
  const on = enabled && Boolean(user)
  const members = useQueries({
    queries: groups.map((g) => ({
      queryKey: groupKeys.members(user?.id, g.id),
      enabled: on,
      queryFn: () => listGroupMembers(g.id),
    })),
  })
  const balances = useQueries({
    queries: groups.map((g) => ({
      queryKey: groupKeys.balances(user?.id, g.id),
      enabled: on,
      queryFn: () => getGroupBalances(g.id),
    })),
  })
  const isLoading = [...members, ...balances].some((q) => q.isLoading)
  const isError = [...members, ...balances].some((q) => q.isError)
  // Cheap (a handful of groups), so computed on every render instead of memoised on query arrays.
  const entries: GroupLedgerEntry[] = groups.map((g, i) => ({
    groupId: g.id,
    groupName: g.name,
    meId,
    ledger: buildLedger({
      meId,
      members: members[i]?.data ?? [],
      balances: balances[i]?.data ?? [],
      expenses: [],
      overlay: overlays[g.id] ?? emptyOverlay(),
    }),
  }))
  const summary = summarizeDebts(entries)

  return { summary, isLoading, isError }
}
