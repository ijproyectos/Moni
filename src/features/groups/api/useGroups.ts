import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import type {
  GroupFormValues,
  RecurringFormValues,
  RecurringStatus,
  MyGroup,
  SettlementFormValues,
  SharedExpenseFormValues,
} from '../domain/group'
import {
  createGroup,
  createInvite,
  createSettlement,
  convertSharedToExpense,
  createSharedExpense,
  getGroup,
  getGroupBalances,
  approveJoinRequest,
  confirmRecurringOccurrence,
  createGroupRecurring,
  listGroupRecurring,
  listRecurringOccurrences,
  processGroupRecurring,
  setGroupRecurringStatus,
  skipRecurringOccurrence,
  updateGroupName,
  updateGroupRecurring,
  cancelInvitation,
  inviteContact,
  listContacts,
  listGroupInvitations,
  listHiddenContacts,
  listMyInvitations,
  respondInvitation,
  setContactPref,
  cancelJoinRequest,
  listJoinRequests,
  listMyJoinRequests,
  rejectJoinRequest,
  requestJoinGroup,
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
  type Replaces,
  archiveGroup,
  hideGroup,
  listHiddenAndArchivedGroups,
  restoreGroup,
  setMemberRole,
} from './groupsRepository'
import { groupKeys } from './queryKeys'

/** How often an open group looks for new members. */
export const MEMBERS_REFRESH_MS = 15_000

export function useMyGroups() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.list(user?.id),
    enabled: Boolean(user),
    queryFn: listMyGroups,
  })
}

/** The groups I removed from my account or that were archived. */
export function useHiddenGroups() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.hidden(user?.id),
    enabled: Boolean(user),
    queryFn: listHiddenAndArchivedGroups,
  })
}

/** I am an administrator (role `owner`) of the group. The server checks it again on every administrative action. */
export function useIsGroupAdmin(groupId: string | undefined, meId: string | undefined): boolean {
  const members = useGroupMembers(groupId)
  return (members.data ?? []).some((m) => m.userId === meId && m.role === 'owner' && m.leftAt === null)
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
    // Someone may join with the code while this group is open: look again every so often (only while the app is
    // visible; coming back to the tab refetches too) so the new person shows up without logging out.
    refetchInterval: MEMBERS_REFRESH_MS,
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

export interface JoinGroupResult {
  /** Null while the request is pending: nothing of the group is known (or shown) before an administrator accepts. */
  groupId: string | null
  /** The person was already in the group: the server consumed no invite use. */
  alreadyMember: boolean
  /** The code needs an administrator's approval: a request was left, the person is not in the group yet. */
  pending: boolean
}

export function useJoinGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: async (code: string): Promise<JoinGroupResult> => {
      // The server answers with the group id both for a new member and for one who is already in,
      // so membership is read first (fresh from the server, cached copy if that fails).
      const listKey = groupKeys.list(user?.id)
      const before = await queryClient
        .fetchQuery({ queryKey: listKey, queryFn: listMyGroups, staleTime: 0 })
        .catch(() => queryClient.getQueryData<MyGroup[]>(listKey))
      const outcome = await requestJoinGroup(code)
      if (outcome.kind === 'pending') return { groupId: null, alreadyMember: false, pending: true }
      return {
        groupId: outcome.groupId,
        alreadyMember: outcome.kind === 'already_member' || Boolean(before?.some((g) => g.id === outcome.groupId)),
        pending: false,
      }
    },
    onSuccess: async () => {
      await invalidate()
      // The list may not be mounted (inactive queries are only marked stale): load it now so the
      // new group is already there when the person lands on Grupos.
      await queryClient.refetchQueries({ queryKey: groupKeys.list(user?.id), type: 'inactive' })
    },
  })
}

/** The requests I made to join groups (pending, or rejected recently). */
export function useMyJoinRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.myRequests(user?.id),
    enabled: Boolean(user),
    queryFn: listMyJoinRequests,
    retry: false,
    refetchInterval: 60_000,
  })
}

/** The people waiting to be accepted in a group. Only asked for by administrators. */
export function useJoinRequests(groupId: string | undefined, enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.requests(user?.id, groupId),
    enabled: Boolean(user && groupId && enabled),
    queryFn: () => listJoinRequests(groupId as string),
    retry: false,
    refetchInterval: 60_000,
  })
}

export function useCancelJoinRequest() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (requestId: string) => cancelJoinRequest(requestId), onSuccess: invalidate })
}

export function useApproveJoinRequest() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (requestId: string) => approveJoinRequest(requestId), onSuccess: invalidate })
}

export function useRejectJoinRequest() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (requestId: string) => rejectJoinRequest(requestId), onSuccess: invalidate })
}

/** My "Personas de Moni": real people I shared a group with. */
export function useContacts() {
  const { user } = useAuth()
  return useQuery({ queryKey: groupKeys.contacts(user?.id), enabled: Boolean(user), queryFn: listContacts, retry: false })
}

export function useHiddenContacts(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.hiddenContacts(user?.id),
    enabled: Boolean(user) && enabled,
    queryFn: listHiddenContacts,
    retry: false,
  })
}

export function useSetContactPref() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ contactId, hidden, blocked }: { contactId: string; hidden: boolean; blocked: boolean }) =>
      setContactPref(contactId, hidden, blocked),
    onSuccess: invalidate,
  })
}

/** The invitations an administrator sent for a group, with how each one stands. */
export function useGroupInvitations(groupId: string | undefined, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.invitations(user?.id, groupId),
    enabled: Boolean(user && groupId) && enabled,
    queryFn: () => listGroupInvitations(groupId as string),
    retry: false,
    refetchInterval: 60_000,
  })
}

export function useInviteContact() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => inviteContact(groupId, userId),
    onSuccess: invalidate,
  })
}

export function useCancelInvitation() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (invitationId: string) => cancelInvitation(invitationId), onSuccess: invalidate })
}

/** The invitations I received and have not answered. */
export function useMyInvitations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.myInvitations(user?.id),
    enabled: Boolean(user),
    queryFn: listMyInvitations,
    retry: false,
    refetchInterval: 60_000,
  })
}

export function useRespondInvitation() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ invitationId, accept }: { invitationId: string; accept: boolean }) => respondInvitation(invitationId, accept),
    onSuccess: invalidate,
  })
}

/** Renames the group in Supabase (administrators only; the server decides). */
export function useUpdateGroupName() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) => updateGroupName(groupId, name),
    onSuccess: invalidate,
  })
}

/**
 * The recurring expenses of a home group and their periods. Opening it asks the server to create the pending periods that are
 * due (idempotent), so what is shown is always up to date.
 */
export function useGroupRecurring(groupId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: groupKeys.recurring(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: async () => {
      await processGroupRecurring(groupId as string)
      await queryClient.invalidateQueries({ queryKey: groupKeys.occurrences(user?.id, groupId) })
      return listGroupRecurring(groupId as string)
    },
    retry: false,
  })
}

export function useRecurringOccurrences(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: groupKeys.occurrences(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listRecurringOccurrences(groupId as string),
    retry: false,
  })
}

function useInvalidateRecurring(groupId: string | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const invalidate = useInvalidateGroupMoney()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.recurring(user?.id, groupId) }),
      queryClient.invalidateQueries({ queryKey: groupKeys.occurrences(user?.id, groupId) }),
      invalidate(),
    ])
}

export function useSaveRecurring(groupId: string | undefined) {
  const invalidate = useInvalidateRecurring(groupId)
  return useMutation({
    mutationFn: ({ id, values, requestKey }: { id: string | null; values: RecurringFormValues; requestKey: string }) =>
      id ? updateGroupRecurring(id, values) : createGroupRecurring(groupId as string, values, requestKey).then(() => undefined),
    onSuccess: invalidate,
  })
}

export function useSetRecurringStatus(groupId: string | undefined) {
  const invalidate = useInvalidateRecurring(groupId)
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RecurringStatus | 'removed' }) => setGroupRecurringStatus(id, status),
    onSuccess: invalidate,
  })
}

/** One tap: registers the shared expense of the period. Repeating it returns the same expense (no duplicate). */
export function useConfirmOccurrence(groupId: string | undefined) {
  const invalidate = useInvalidateRecurring(groupId)
  return useMutation({
    mutationFn: ({ occurrenceId, amountCents }: { occurrenceId: string; amountCents: number | null }) =>
      confirmRecurringOccurrence(occurrenceId, amountCents),
    onSuccess: invalidate,
  })
}

export function useSkipOccurrence(groupId: string | undefined) {
  const invalidate = useInvalidateRecurring(groupId)
  return useMutation({ mutationFn: (occurrenceId: string) => skipRecurringOccurrence(occurrenceId), onSuccess: invalidate })
}

export function useHideGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (groupId: string) => hideGroup(groupId), onSuccess: invalidate })
}

export function useRestoreGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: (groupId: string) => restoreGroup(groupId), onSuccess: invalidate })
}

export function useArchiveGroup() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) => archiveGroup(groupId, name),
    onSuccess: invalidate,
  })
}

export function useSetMemberRole() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({
    mutationFn: ({ groupId, userId, role }: { groupId: string; userId: string; role: 'owner' | 'member' }) =>
      setMemberRole(groupId, userId, role),
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
    mutationFn: ({
      groupId,
      values,
      replaces,
    }: {
      groupId: string
      values: SharedExpenseFormValues
      replaces?: Replaces
    }) => createSharedExpense(groupId, values, replaces),
    onSuccess: invalidate,
  })
}

/** Shared -> individual: one atomic step on the server, refreshing groups, accounts, activity and Inicio. */
export function useConvertSharedToExpense() {
  const invalidate = useInvalidateGroupMoney()
  return useMutation({ mutationFn: convertSharedToExpense, onSuccess: invalidate })
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
