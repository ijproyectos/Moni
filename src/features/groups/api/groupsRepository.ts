import { z } from 'zod'
import type {
  Group as GroupRow,
  GroupRole,
  SettlementRow,
  SharedExpenseRow,
  SharedExpenseSplitRow,
} from '@/shared/lib/database.types'
import { mapPlusRequired } from '@/shared/lib/errors'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  Group,
  GroupFormValues,
  GroupInvite,
  GroupMember,
  Contact,
  GroupInvitation,
  GroupRecurring,
  RecurringFormValues,
  RecurringOccurrence,
  RecurringPeriod,
  RecurringStatus,
  HiddenContact,
  HiddenGroup,
  InvitationStatus,
  MyInvitation,
  JoinOutcome,
  JoinRequest,
  MyJoinRequest,
  MemberBalance,
  MyGroup,
  Settlement,
  SettlementFormValues,
  SharedExpense,
  SharedExpenseFormValues,
} from '../domain/group'
import { normalizeKind } from '../domain/group'

const toNumeric = (cents: number) => Number(fromCents(cents))

const cents = z.number().transform((value) => toCents(value))

const balancesSchema = z.object({
  members: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string().nullable(),
      paid: cents,
      owed: cents,
      settled_out: cents,
      settled_in: cents,
      net: cents,
    }),
  ),
})

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    kind: normalizeKind(row.kind),
    createdBy: row.created_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }
}

function toExpense(row: SharedExpenseRow, splits: SharedExpenseSplitRow[]): SharedExpense {
  return {
    id: row.id,
    groupId: row.group_id,
    paidBy: row.paid_by,
    amountCents: toCents(row.amount),
    description: row.description,
    templateSlug: row.template_slug,
    occurredOn: row.occurred_on,
    splitMethod: row.split_method,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    splits: splits.map((s) => ({
      userId: s.user_id,
      shareCents: toCents(s.share_amount),
      percent: s.percent,
    })),
  }
}

function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    groupId: row.group_id,
    fromUser: row.from_user,
    toUser: row.to_user,
    amountCents: toCents(row.amount),
    occurredOn: row.occurred_on,
    note: row.note,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listMyGroups(): Promise<MyGroup[]> {
  const { data, error } = await getSupabase().rpc('get_my_groups')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    kind: normalizeKind(row.kind),
    role: row.role,
    memberCount: row.member_count,
    myNetCents: toCents(row.my_net),
    lastActivity: row.last_activity,
    hiddenAt: row.hidden_at ?? null,
  }))
}

export async function listHiddenAndArchivedGroups(): Promise<HiddenGroup[]> {
  const { data, error } = await getSupabase().rpc('get_my_hidden_and_archived_groups')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    kind: normalizeKind(row.kind),
    role: row.role,
    memberCount: row.member_count,
    myNetCents: toCents(row.my_net),
    lastActivity: row.last_activity,
    hiddenAt: row.hidden_at,
    archivedAt: row.archived_at,
  }))
}

/** Removes the group from MY account only: I stay a member and nothing changes for the others. */
export async function hideGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('hide_group_for_me', { p_group: groupId })
  if (error) throw error
}

export async function restoreGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('restore_group_for_me', { p_group: groupId })
  if (error) throw error
}

/** Administrators only. Archives (never deletes); the server refuses it while there are debts or unresolved payments. */
export async function archiveGroup(groupId: string, nameConfirmation: string): Promise<void> {
  const { error } = await getSupabase().rpc('archive_group_for_all', {
    p_group: groupId,
    p_name_confirmation: nameConfirmation,
  })
  if (error) throw error
}

export async function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
  const { error } = await getSupabase().rpc('set_member_role', { p_group: groupId, p_user: userId, p_role: role })
  if (error) throw error
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await getSupabase()
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  return data ? toGroup(data) : null
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await getSupabase().rpc('get_group_members', { p_group: groupId })
  if (error) throw error
  return data.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  }))
}

/** Invites of a group (members can read them); the caller filters the active ones. */
export async function listGroupInvites(groupId: string): Promise<GroupInvite[]> {
  const { data, error } = await getSupabase()
    .from('group_invites')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    code: row.code,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    revokedAt: row.revoked_at,
  }))
}

export async function getGroupBalances(groupId: string): Promise<MemberBalance[]> {
  const { data, error } = await getSupabase().rpc('get_group_balances', { p_group: groupId })
  if (error) throw error
  return balancesSchema.parse(data).members.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    paidCents: m.paid,
    owedCents: m.owed,
    settledOutCents: m.settled_out,
    settledInCents: m.settled_in,
    netCents: m.net,
  }))
}

/** Newest first, including voided rows (the UI shows them struck through). */
export async function listSharedExpenses(groupId: string): Promise<SharedExpense[]> {
  const supabase = getSupabase()
  const [expenses, splits] = await Promise.all([
    supabase
      .from('shared_expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('shared_expense_splits').select('*').eq('group_id', groupId),
  ])
  if (expenses.error) throw expenses.error
  if (splits.error) throw splits.error

  const byExpense = new Map<string, SharedExpenseSplitRow[]>()
  for (const split of splits.data) {
    byExpense.set(split.expense_id, [...(byExpense.get(split.expense_id) ?? []), split])
  }
  return expenses.data.map((row) => toExpense(row, byExpense.get(row.id) ?? []))
}

export async function listSettlements(groupId: string): Promise<Settlement[]> {
  const { data, error } = await getSupabase()
    .from('settlements')
    .select('*')
    .eq('group_id', groupId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(toSettlement)
}

export async function createGroup(values: GroupFormValues): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_group', {
    p_name: values.name,
    // "Hogar" is sent with its old name: the database accepts 'casa' before and after the rename (it stores it as 'hogar'), so
    // the app works the same whichever side is published first.
    p_kind: values.kind === 'hogar' ? 'casa' : values.kind,
  })
  // Free plan: a second active group raises 'plus_required' (see 20261106000000_moni_plus.sql).
  if (error) throw mapPlusRequired(error)
  return data
}

export async function createInvite(groupId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_group_invite', { p_group: groupId })
  if (error) throw error
  return data
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_group_invite', { p_invite: inviteId })
  if (error) throw error
}

/** Returns the id of the joined group. */
export async function joinGroup(code: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('join_group', { p_code: code })
  if (error) throw error
  // The server returns NULL for every invalid code (it must record the failed attempt, which an
  // exception would roll back); surface it as the uniform 'invite_invalid' error.
  if (!data) throw new Error('invite_invalid')
  return data
}

/** True when the database does not have the function yet (it is applied together with the app that uses it). */
const isMissingFunction = (error: { code?: string }) => error.code === 'PGRST202' || error.code === '42883'

/**
 * Asks to join a group with a code. Codes that need approval leave a pending request (the person is NOT in the group, and sees
 * nothing of it, until an administrator accepts); old codes still join right away. Against a database without the requests
 * (not applied yet) it falls back to the direct join, so the app keeps working.
 */
export async function requestJoinGroup(code: string): Promise<JoinOutcome> {
  const { data, error } = await getSupabase().rpc('request_join_group', { p_code: code })
  if (error) {
    if (isMissingFunction(error)) return { kind: 'joined', groupId: await joinGroup(code) }
    throw error
  }
  const row = data[0]
  if (!row || row.result === 'invalid') throw new Error('invite_invalid')
  if (row.result === 'pending') return { kind: 'pending', groupId: row.group_id }
  return { kind: row.result === 'already_member' ? 'already_member' : 'joined', groupId: row.group_id as string }
}

/** The requests I made (pending, or rejected in the last week). Empty if the database does not have them yet. */
export async function listMyJoinRequests(): Promise<MyJoinRequest[]> {
  const { data, error } = await getSupabase().rpc('get_my_join_requests')
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    id: r.request_id,
    groupId: r.group_id,
    groupName: r.group_name,
    status: r.status === 'rejected' ? 'rejected' : 'pending',
    createdAt: r.created_at,
  }))
}

/** Pending requests of a group: administrators only (the server refuses anybody else). */
export async function listJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const { data, error } = await getSupabase().rpc('get_join_requests', { p_group: groupId })
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    id: r.request_id,
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }))
}

export async function approveJoinRequest(requestId: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('approve_join_request', { p_request: requestId })
  if (error) throw error
  return data
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
  const { error } = await getSupabase().rpc('reject_join_request', { p_request: requestId })
  if (error) throw error
}

export async function cancelJoinRequest(requestId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_join_request', { p_request: requestId })
  if (error) throw error
}

/** My contacts: real people I shared a group with (name and photo only). Empty if the database does not have them yet. */
export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await getSupabase().rpc('get_my_contacts')
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({ userId: r.user_id, displayName: r.display_name, avatarUrl: r.avatar_url }))
}

export async function listHiddenContacts(): Promise<HiddenContact[]> {
  const { data, error } = await getSupabase().rpc('get_hidden_contacts')
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    hidden: r.hidden,
    blocked: r.blocked,
  }))
}

/** Hides or blocks a contact (both false: shows it again). Blocking also stops that person from inviting me. */
export async function setContactPref(contactId: string, hidden: boolean, blocked: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_contact_pref', { p_contact: contactId, p_hidden: hidden, p_blocked: blocked })
  if (error) throw error
}

/** Administrators only. The person gets a notice and decides: nobody is added without accepting. */
export async function inviteContact(groupId: string, userId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('invite_contact', { p_group: groupId, p_user: userId })
  if (error) throw error
  return data
}

/** Answers an invitation I received. Returns the group id when I accepted, null otherwise. */
export async function respondInvitation(invitationId: string, accept: boolean): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('respond_group_invitation', { p_invitation: invitationId, p_accept: accept })
  if (error) throw error
  return data
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_group_invitation', { p_invitation: invitationId })
  if (error) throw error
}

export async function listGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
  const { data, error } = await getSupabase().rpc('get_group_invitations', { p_group: groupId })
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    id: r.invitation_id,
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    status: (['accepted', 'declined', 'expired'].includes(r.status) ? r.status : 'pending') as InvitationStatus,
    createdAt: r.created_at,
  }))
}

export async function listMyInvitations(): Promise<MyInvitation[]> {
  const { data, error } = await getSupabase().rpc('get_my_group_invitations')
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    id: r.invitation_id,
    groupId: r.group_id,
    groupName: r.group_name,
    invitedByName: r.invited_by_name,
    createdAt: r.created_at,
  }))
}

/** Administrators only: saves the new name in Supabase (every member sees it). Resolves only when the server confirmed it. */
export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const { error } = await getSupabase().rpc('update_group_name', { p_group: groupId, p_name: name })
  if (error) throw error
}

const splitArrays = (values: RecurringFormValues) => ({
  participants: values.participants.map((p) => p.userId),
  percents: values.splitMethod === 'percent' ? values.participants.map((p) => p.percent ?? 0) : null,
})

/** The recurring expenses of a home group (the saved definition). Empty if the database does not have them yet. */
export async function listGroupRecurring(groupId: string): Promise<GroupRecurring[]> {
  const { data, error } = await getSupabase().rpc('get_group_recurring', { p_group: groupId })
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    templateSlug: r.template_slug,
    amountCents: toCents(r.amount),
    period: r.period as RecurringPeriod,
    anchorOn: r.anchor_on,
    nextDueOn: r.next_due_on,
    paidBy: r.paid_by,
    paidByName: r.paid_by_name,
    splitMethod: r.split_method as GroupRecurring['splitMethod'],
    status: r.status as RecurringStatus,
    participants: r.participants.map((p) => ({ userId: p.user_id, name: p.name, percent: p.percent })),
  }))
}

/** Pending periods and the history of the last year. */
export async function listRecurringOccurrences(groupId: string): Promise<RecurringOccurrence[]> {
  const { data, error } = await getSupabase().rpc('get_group_recurring_occurrences', { p_group: groupId })
  if (error) {
    if (isMissingFunction(error)) return []
    throw error
  }
  return data.map((o) => ({
    id: o.id,
    recurringId: o.recurring_id,
    periodKey: o.period_key,
    dueOn: o.due_on,
    amountCents: toCents(o.amount),
    status: o.status as RecurringOccurrence['status'],
    expenseId: o.expense_id,
    resolvedAt: o.resolved_at,
  }))
}

/** Creates the pending periods that are due (never an expense) and tells who pays. Safe to call every time the screen opens. */
export async function processGroupRecurring(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('process_group_recurring', { p_group: groupId })
  if (error && !isMissingFunction(error)) throw error
}

/** `requestKey` makes a double tap or a retry after a lost connection create it only once. */
export async function createGroupRecurring(groupId: string, values: RecurringFormValues, requestKey: string): Promise<string> {
  const { participants, percents } = splitArrays(values)
  const { data, error } = await getSupabase().rpc('create_group_recurring', {
    p_group: groupId,
    p_name: values.name,
    p_template_slug: values.templateSlug,
    p_amount: toNumeric(values.amountCents),
    p_period: values.period,
    p_anchor_on: values.anchorOn,
    p_paid_by: values.paidBy,
    p_split_method: values.splitMethod,
    p_participants: participants,
    p_percents: percents,
    p_request_key: requestKey,
  })
  if (error) throw error
  return data
}

export async function updateGroupRecurring(id: string, values: RecurringFormValues): Promise<void> {
  const { participants, percents } = splitArrays(values)
  const { error } = await getSupabase().rpc('update_group_recurring', {
    p_id: id,
    p_name: values.name,
    p_template_slug: values.templateSlug,
    p_amount: toNumeric(values.amountCents),
    p_period: values.period,
    p_anchor_on: values.anchorOn,
    p_paid_by: values.paidBy,
    p_split_method: values.splitMethod,
    p_participants: participants,
    p_percents: percents,
  })
  if (error) throw error
}

export async function setGroupRecurringStatus(id: string, status: RecurringStatus | 'removed'): Promise<void> {
  const { error } = await getSupabase().rpc('set_group_recurring_status', { p_id: id, p_status: status })
  if (error) throw error
}

/** The one-tap confirmation: registers the shared expense (the existing logic) with this period's amount. Safe to repeat. */
export async function confirmRecurringOccurrence(occurrenceId: string, amountCents: number | null): Promise<string> {
  const { data, error } = await getSupabase().rpc('confirm_group_recurring_occurrence', {
    p_occurrence: occurrenceId,
    p_amount: amountCents === null ? null : toNumeric(amountCents),
    p_payer_account_id: null,
  })
  if (error) throw error
  return data
}

export async function skipRecurringOccurrence(occurrenceId: string): Promise<void> {
  const { error } = await getSupabase().rpc('skip_group_recurring_occurrence', { p_occurrence: occurrenceId })
  if (error) throw error
}

/** What a code says about its group before the person confirms: the real name, none (not valid) or not available yet. */
export type InvitePreview =
  { status: 'found'; groupName: string } | { status: 'invalid' } | { status: 'unavailable' }

/**
 * The name of the group an invite code belongs to (from Supabase, never made up). The server answers NULL for any code
 * it would not accept right now: unknown, expired, revoked, used up. If the database does not have the function yet
 * (PGRST202 / 42883) nothing can be said about the group, and the page keeps its generic title.
 */
export async function previewGroupInvite(code: string): Promise<InvitePreview> {
  const { data, error } = await getSupabase().rpc('preview_group_invite', { p_code: code })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return { status: 'unavailable' }
    throw error
  }
  const name = data?.trim()
  return name ? { status: 'found', groupName: name } : { status: 'invalid' }
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('leave_group', { p_group: groupId })
  if (error) throw error
}

/** What a new expense replaces when an expense is edited or an individual one is shared (voided in the same step). */
export type Replaces = { kind: 'transaction' | 'shared' | 'guest'; id: string }

export async function createSharedExpense(
  groupId: string,
  values: SharedExpenseFormValues,
  replaces?: Replaces,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_shared_expense', {
    p_group: groupId,
    p_amount: toNumeric(values.amount),
    p_description: values.description,
    p_template_slug: values.templateSlug,
    p_occurred_on: values.occurredOn,
    p_paid_by: values.paidBy,
    p_split_method: values.splitMethod,
    p_participants: values.participants,
    p_percents: values.percentValues,
    p_payer_account_id: values.payerAccountId,
    ...(replaces ? { p_replaces_kind: replaces.kind, p_replaces_id: replaces.id } : {}),
  })
  if (error) throw error
  return data
}

export async function voidSharedExpense(expenseId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_shared_expense', { p_expense: expenseId })
  if (error) throw error
}

export async function createSettlement(
  groupId: string,
  values: SettlementFormValues,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_settlement', {
    p_group: groupId,
    p_to_user: values.toUser,
    p_amount: toNumeric(values.amount),
    p_occurred_on: values.occurredOn,
    p_note: values.note,
    p_account_id: values.accountId,
  })
  if (error) throw error
  return data
}

export async function recordSettlementReceipt(
  settlementId: string,
  accountId: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('record_settlement_receipt', {
    p_settlement: settlementId,
    p_account_id: accountId,
  })
  if (error) throw error
  return data
}

export async function voidSettlement(settlementId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_settlement', { p_settlement: settlementId })
  if (error) throw error
}

/** The payer turns a shared expense (real or with people without an account) into an individual expense. */
export async function convertSharedToExpense(args: {
  kind: 'shared' | 'guest'
  id: string
  accountId: string
  categoryId: string
  note?: string
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('convert_shared_to_expense', {
    p_kind: args.kind,
    p_id: args.id,
    p_account: args.accountId,
    p_category: args.categoryId,
    p_note: args.note ?? null,
  })
  if (error) throw error
  return data
}
