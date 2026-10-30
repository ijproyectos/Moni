import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { getGroupBalances } from '@/features/groups/api/groupsRepository'
import { groupKeys } from '@/features/groups/api/queryKeys'
import { useMyGroups } from '@/features/groups/api/useGroups'
import { useOverlays } from '@/features/groups/mock/overlayStore'
import { buildPendingDebts, type GroupBalances } from '../domain/debts'
import { debtKeys } from './queryKeys'
import {
  cancelPaymentReport,
  confirmPaymentReport,
  listNotices,
  listPaymentReports,
  markNoticesRead,
  rejectPaymentReport,
  remindDebt,
  reportPayment,
} from './debtsRepository'

export function usePaymentReports() {
  const { user } = useAuth()
  return useQuery({
    queryKey: debtKeys.reports(user?.id),
    enabled: Boolean(user),
    queryFn: listPaymentReports,
    retry: false,
  })
}

/** The person's notifications; refreshed now and then and when they come back to the app. */
export function useNotices() {
  const { user } = useAuth()
  return useQuery({
    queryKey: debtKeys.notices(user?.id),
    enabled: Boolean(user),
    queryFn: listNotices,
    retry: false,
    refetchInterval: 60_000,
  })
}

export function useUnreadNoticeCount(): number {
  const notices = useNotices()
  return (notices.data ?? []).filter((n) => n.readAt === null).length
}

/**
 * The debts of every group the person is in: the real balances of each group (the same query the group screen uses, so
 * nothing is fetched twice), simplified into "who pays whom", plus the payments already reported.
 */
export function usePendingDebts() {
  const { user } = useAuth()
  const groups = useMyGroups()
  const overlays = useOverlays()
  const reports = usePaymentReports()
  const visible = (groups.data ?? []).filter((g) => !overlays[g.id]?.deleted)
  const balances = useQueries({
    queries: visible.map((g) => ({
      queryKey: groupKeys.balances(user?.id, g.id),
      queryFn: () => getGroupBalances(g.id),
    })),
  })

  const loaded: GroupBalances[] = []
  visible.forEach((g, i) => {
    const data = balances[i]?.data
    if (data)
      loaded.push({ groupId: g.id, groupName: overlays[g.id]?.name ?? g.name, balances: data })
  })
  const debts = user ? buildPendingDebts(loaded, user.id, reports.data ?? []) : []
  return {
    debts,
    reports,
    isLoading: groups.isLoading || balances.some((b) => b.isLoading),
    isError: groups.isError || balances.some((b) => b.isError),
  }
}

function useInvalidateDebts() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: debtKeys.all(user?.id) }),
      // A confirmed payment is a settlement: balances, the group lists and Inicio refresh.
      queryClient.invalidateQueries({ queryKey: groupKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
    ])
}

export function useRemindDebt() {
  const invalidate = useInvalidateDebts()
  return useMutation({ mutationFn: remindDebt, onSuccess: invalidate })
}

export function useReportPayment() {
  const invalidate = useInvalidateDebts()
  return useMutation({ mutationFn: reportPayment, onSuccess: invalidate })
}

export function useConfirmPayment() {
  const invalidate = useInvalidateDebts()
  return useMutation({ mutationFn: confirmPaymentReport, onSuccess: invalidate })
}

export function useRejectPayment() {
  const invalidate = useInvalidateDebts()
  return useMutation({ mutationFn: rejectPaymentReport, onSuccess: invalidate })
}

export function useCancelPayment() {
  const invalidate = useInvalidateDebts()
  return useMutation({ mutationFn: cancelPaymentReport, onSuccess: invalidate })
}

export function useMarkNoticesRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: markNoticesRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtKeys.notices(user?.id) }),
  })
}
