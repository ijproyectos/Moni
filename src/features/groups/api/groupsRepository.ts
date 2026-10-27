import { z } from 'zod'
import type {
  Group as GroupRow,
  SettlementRow,
  SharedExpenseRow,
  SharedExpenseSplitRow,
} from '@/shared/lib/database.types'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  Group,
  GroupFormValues,
  GroupInvite,
  GroupMember,
  MemberBalance,
  MyGroup,
  Settlement,
  SettlementFormValues,
  SharedExpense,
  SharedExpenseFormValues,
} from '../domain/group'

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
    kind: row.kind,
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
    kind: row.kind,
    role: row.role,
    memberCount: row.member_count,
    myNetCents: toCents(row.my_net),
    lastActivity: row.last_activity,
  }))
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
    p_kind: values.kind,
  })
  if (error) throw error
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

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('leave_group', { p_group: groupId })
  if (error) throw error
}

export async function createSharedExpense(
  groupId: string,
  values: SharedExpenseFormValues,
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
