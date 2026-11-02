import type {
  GroupGuestExpensePartRow,
  GroupGuestExpenseRow,
  GroupGuestRow,
  GroupGuestSettlementRow,
} from '@/shared/lib/database.types'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type { Guest, SimAmount, SimExpense, SimSettlement } from '../mock/overlayStore'

const toNumeric = (cents: number) => Number(fromCents(cents))

/** What the database knows, per group, about people without an account and the records that involve them. */
export interface GuestState {
  guests: Guest[]
  expenses: SimExpense[]
  settlements: SimSettlement[]
}

export const EMPTY_GUEST_STATE: GuestState = { guests: [], expenses: [], settlements: [] }

export type GuestStateByGroup = Record<string, GuestState>

function stateOf(map: GuestStateByGroup, groupId: string): GuestState {
  return (map[groupId] ??= { guests: [], expenses: [], settlements: [] })
}

function toGuest(row: GroupGuestRow): Guest {
  return { id: row.id, name: row.name, alias: row.alias }
}

function toExpense(row: GroupGuestExpenseRow, parts: GroupGuestExpensePartRow[]): SimExpense {
  const amounts = (role: 'payer' | 'share'): SimAmount[] =>
    parts
      .filter((p) => p.role === role)
      .map((p) => ({ personId: p.person_id, cents: toCents(p.amount) }))
  return {
    id: row.id,
    description: row.description,
    amountCents: toCents(row.amount),
    payers: amounts('payer'),
    shares: amounts('share'),
    occurredOn: row.occurred_on,
    templateSlug: row.template_slug,
    methodLabel: row.method_label,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

function toSettlement(row: GroupGuestSettlementRow): SimSettlement {
  return {
    id: row.id,
    fromId: row.from_person,
    toId: row.to_person,
    cents: toCents(row.amount),
    method: row.method,
    occurredOn: row.occurred_on,
  }
}

/** Everything for the groups the person belongs to (row level security keeps out the rest). */
export async function listGuestState(): Promise<GuestStateByGroup> {
  const db = getSupabase()
  const [guests, expenses, parts, settlements] = await Promise.all([
    db
      .from('group_guests')
      .select('*')
      .is('removed_at', null)
      .is('linked_user_id', null)
      .order('created_at'),
    db.from('group_guest_expenses').select('*').eq('status', 'posted').order('created_at'),
    db.from('group_guest_expense_parts').select('*'),
    db.from('group_guest_settlements').select('*').eq('status', 'posted').order('created_at'),
  ])
  for (const result of [guests, expenses, parts, settlements]) if (result.error) throw result.error

  const byGroup: GuestStateByGroup = {}
  for (const g of guests.data ?? []) stateOf(byGroup, g.group_id).guests.push(toGuest(g))
  const partsByExpense = new Map<string, GroupGuestExpensePartRow[]>()
  for (const p of parts.data ?? []) {
    partsByExpense.set(p.expense_id, [...(partsByExpense.get(p.expense_id) ?? []), p])
  }
  // Newest first, like the group's own expense list.
  for (const e of [...(expenses.data ?? [])].reverse()) {
    stateOf(byGroup, e.group_id).expenses.push(toExpense(e, partsByExpense.get(e.id) ?? []))
  }
  for (const s of settlements.data ?? [])
    stateOf(byGroup, s.group_id).settlements.push(toSettlement(s))
  return byGroup
}

export async function addGroupGuest(groupId: string, name: string, alias: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('add_group_guest', {
    p_group: groupId,
    p_name: name,
    p_alias: alias,
  })
  if (error) throw error
  return data
}

export async function updateGroupGuest(
  guestId: string,
  name: string,
  alias: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('update_group_guest', {
    p_guest: guestId,
    p_name: name,
    p_alias: alias,
  })
  if (error) throw error
}

export async function removeGroupGuest(guestId: string): Promise<void> {
  const { error } = await getSupabase().rpc('remove_group_guest', { p_guest: guestId })
  if (error) throw error
}

export async function linkGroupGuest(guestId: string, userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('link_group_guest', {
    p_guest: guestId,
    p_user: userId,
  })
  if (error) throw error
}

export type GuestExpenseInput = Omit<SimExpense, 'id' | 'createdAt'>

export async function createGuestExpense(
  groupId: string,
  e: GuestExpenseInput,
  replaces?: { kind: 'transaction' | 'shared' | 'guest'; id: string },
): Promise<string> {
  const parts = (list: SimAmount[]) =>
    list.map((p) => ({ personId: p.personId, amount: toNumeric(p.cents) }))
  const { data, error } = await getSupabase().rpc('create_guest_expense', {
    p_group: groupId,
    p_description: e.description,
    p_amount: toNumeric(e.amountCents),
    p_occurred_on: e.occurredOn,
    p_template_slug: e.templateSlug,
    p_method_label: e.methodLabel,
    p_payers: parts(e.payers),
    p_shares: parts(e.shares),
    p_payer_account_id: e.payerAccountId ?? null,
    ...(replaces ? { p_replaces_kind: replaces.kind, p_replaces_id: replaces.id } : {}),
  })
  if (error) throw error
  return data
}

export async function voidGuestExpense(expenseId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_guest_expense', { p_expense: expenseId })
  if (error) throw error
}

export async function createGuestSettlement(
  groupId: string,
  s: Omit<SimSettlement, 'id'>,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_guest_settlement', {
    p_group: groupId,
    p_from: s.fromId,
    p_to: s.toId,
    p_amount: toNumeric(s.cents),
    p_method: s.method,
    p_occurred_on: s.occurredOn,
    p_account_id: s.accountId ?? null,
  })
  if (error) throw error
  return data
}

export async function voidGuestSettlement(settlementId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_guest_settlement', { p_settlement: settlementId })
  if (error) throw error
}
