import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import type {
  GroupFormValues,
  SettlementFormValues,
  SharedExpenseFormValues,
} from '../domain/group'
import {
  createGroup,
  createInvite,
  createSettlement,
  createSharedExpense,
  getGroup,
  getGroupBalances,
  joinGroup,
  leaveGroup,
  listGroupInvites,
  listGroupMembers,
  listMyGroups,
  listSettlements,
  listSharedExpenses,
  recordSettlementReceipt,
  revokeInvite,
  voidSettlement,
  voidSharedExpense,
} from './groupsRepository'
import { groupKeys } from './queryKeys'

export function useMyGroups() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.list(user?.id),
    enabled: Boolean(user),
    queryFn: listMyGroups,
  })
}

export function useGroup(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.detail(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => getGroup(groupId as string),
  })
}

export function useGroupMembers(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.members(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listGroupMembers(groupId as string),
  })
}

export function useGroupInvites(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.invites(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listGroupInvites(groupId as string),
  })
}

export function useGroupBalances(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.balances(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => getGroupBalances(groupId as string),
  })
}

export function useSharedExpenses(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.expenses(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listSharedExpenses(groupId as string),
  })
}

export function useSettlements(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.settlements(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listSettlements(groupId as string),
  })
}

// Group changes can move balances, personal transactions (shared_payment / settlement_*) and the
// month summary (own share), so group, account, dashboard and transaction caches all go stale.
function useInvalidateGroupMoney() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
    ])
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (values: GroupFormValues) => createGroup(values),
    onSuccess: invalidate,
  })
}

export function useCreateInvite() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (groupId: string) => createInvite(groupId),
    onSuccess: invalidate,
  })
}

export function useRevokeInvite() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(inviteId),
    onSuccess: invalidate,
  })
}

export function useJoinGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (code: string) => joinGroup(code),
    onSuccess: invalidate,
  })
}

export function useLeaveGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: invalidate,
  })
}

export function useCreateSharedExpense() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, values }: { groupId: string; values: SharedExpenseFormValues }) =>
      createSharedExpense(groupId, values),
    onSuccess: invalidate,
  })
}

export function useVoidSharedExpense() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (expenseId: string) => voidSharedExpense(expenseId),
    onSuccess: invalidate,
  })
}

export function useCreateSettlement() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, values }: { groupId: string; values: SettlementFormValues }) =>
      createSettlement(groupId, values),
    onSuccess: invalidate,
  })
}

export function useRecordSettlementReceipt() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ settlementId, accountId }: { settlementId: string; accountId: string }) =>
      recordSettlementReceipt(settlementId, accountId),
    onSuccess: invalidate,
  })
}

export function useVoidSettlement() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: (settlementId: string) => voidSettlement(settlementId),
    onSuccess: invalidate,
  })
}
