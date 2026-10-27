import type { Cents } from '@/shared/lib/money'
import {
  memberLabel,
  type GroupMember,
  type MemberBalance,
  type MyGroup,
  type Settlement,
  type SharedExpense,
} from './group'
import { simplifyDebts, type Transfer } from './split'

export type NetTone = 'owed' | 'owes' | 'even' | 'empty'

export interface NetDescription {
  tone: NetTone
  label: string
  /** Absolute amount to show next to the label; null when there is none. */
  amountCents: Cents | null
}

/** Right-hand label of a group card: "Te deben $X", "Debés $X", "Estás al día" or "Sin gastos todavía". */
export function describeGroupNet(
  group: Pick<MyGroup, 'myNetCents' | 'memberCount'>,
): NetDescription {
  if (group.myNetCents > 0) {
    return { tone: 'owed', label: 'Te deben', amountCents: group.myNetCents }
  }
  if (group.myNetCents < 0) {
    return { tone: 'owes', label: 'Debés', amountCents: -group.myNetCents }
  }
  // The list RPC cannot tell "no expenses" from "settled"; a lone member can only have the former.
  return group.memberCount <= 1
    ? { tone: 'empty', label: 'Sin gastos todavía', amountCents: null }
    : { tone: 'even', label: 'Estás al día', amountCents: null }
}

/** Headline of the balance card in the group detail. */
export function describeMyBalance(netCents: Cents): NetDescription {
  if (netCents > 0) return { tone: 'owed', label: 'Te deben', amountCents: netCents }
  if (netCents < 0) return { tone: 'owes', label: 'Debés', amountCents: -netCents }
  return { tone: 'even', label: 'Estás al día', amountCents: null }
}

/** "Casa · Solo vos por ahora" / "Viaje · 3 miembros". */
export function groupSubtitle(kindLabel: string, memberCount: number): string {
  const members = memberCount <= 1 ? 'Solo vos por ahora' : `${memberCount} miembros`
  return `${kindLabel} · ${members}`
}

/** Leaving is only allowed with a zero balance (the database enforces it too). */
export function leaveState(netCents: Cents | null): { canLeave: boolean; reason: string | null } {
  if (netCents === null) {
    return { canLeave: false, reason: 'Todavía estamos calculando tu saldo. Probá en un momento.' }
  }
  if (netCents === 0) return { canLeave: true, reason: null }
  return {
    canLeave: false,
    reason:
      netCents > 0
        ? 'Todavía te deben plata. Pedí que te paguen y registrá el pago para poder salir.'
        : 'Todavía debés plata. Saldá tus cuentas para poder salir del grupo.',
  }
}

/** Suggested payments that settle the group. Empty when balances are inconsistent instead of throwing. */
export function suggestTransfers(balances: readonly MemberBalance[]): Transfer[] {
  try {
    return simplifyDebts(balances.map((b) => ({ userId: b.userId, netCents: b.netCents })))
  } catch {
    return []
  }
}

export function nameById(
  people: readonly { userId: string; displayName: string | null }[],
  userId: string,
  meId?: string,
): string {
  if (userId === meId) return 'Vos'
  const person = people.find((p) => p.userId === userId)
  return person ? memberLabel(person) : 'Sin nombre'
}

export function activeMembers(members: readonly GroupMember[]): GroupMember[] {
  return members.filter((m) => m.leftAt === null)
}

/** Avatar initial for a member name. */
export function memberInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/** Normalizes a pasted invite link or raw code into the code part. */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/unirse/${code}`
}

/** The server lets the creator, the payer or any participant void a shared expense. */
export function canVoidExpense(
  expense: Pick<SharedExpense, 'status' | 'createdBy' | 'paidBy' | 'splits'>,
  meId: string | undefined,
): boolean {
  return (
    expense.status === 'posted' &&
    Boolean(meId) &&
    (expense.createdBy === meId ||
      expense.paidBy === meId ||
      expense.splits.some((split) => split.userId === meId))
  )
}

/** The server lets the debtor (from_user), the receiver (to_user) or the creator void a settlement. */
export function canVoidSettlement(
  settlement: Pick<Settlement, 'status' | 'createdBy' | 'fromUser' | 'toUser'>,
  meId: string | undefined,
): boolean {
  return (
    settlement.status === 'posted' &&
    Boolean(meId) &&
    (settlement.fromUser === meId ||
      settlement.toUser === meId ||
      settlement.createdBy === meId)
  )
}

/** Only the receiver can record a received settlement into one of their accounts. */
export function canRecordReceipt(
  settlement: Pick<Settlement, 'status' | 'toUser'>,
  meId: string | undefined,
): boolean {
  return settlement.status === 'posted' && Boolean(meId) && settlement.toUser === meId
}

/** What the person owes for an expense (their own split), or 0 when they are not in it. */
export function myShareCents(
  expense: Pick<SharedExpense, 'splits'>,
  meId: string | undefined,
): Cents {
  return expense.splits.find((s) => s.userId === meId)?.shareCents ?? 0
}
