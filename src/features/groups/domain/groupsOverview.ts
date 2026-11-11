import type { Cents } from '@/shared/lib/money'
import type { LedgerExpense } from './ledger'

/** Totals of the Grupos hero: what the groups owe me and what I owe, summed over every group. */
export function balanceTotals(groups: readonly { myNetCents: Cents }[]): {
  owedCents: Cents
  oweCents: Cents
} {
  return {
    owedCents: groups.reduce((s, g) => s + Math.max(0, g.myNetCents), 0),
    oweCents: groups.reduce((s, g) => s + Math.max(0, -g.myNetCents), 0),
  }
}

/** The group with the most recent activity (the one "Último en ..." reads from). */
export function mostRecentGroup<T extends { lastActivity: string }>(
  groups: readonly T[],
): T | undefined {
  return groups.reduce<T | undefined>(
    (best, g) => (!best || g.lastActivity > best.lastActivity ? g : best),
    undefined,
  )
}

export interface LastExpenseView {
  description: string
  occurredOn: string
  templateSlug: string | null
  methodLabel: string
  /** True when I am the only payer. */
  paidByMe: boolean
  /** Payer name (third person) when someone else paid. */
  payerId: string
  /** What the expense did to my balance: I paid minus my share (positive: they owe me). */
  myDeltaCents: Cents
}

/** The latest expense of a ledger, seen from my side; null when the group has none. */
export function lastExpenseView(
  expenses: readonly LedgerExpense[],
  meId: string,
): LastExpenseView | null {
  const e = expenses[0]
  if (!e) return null
  const myPaid = e.payers.find((p) => p.personId === meId)?.cents ?? 0
  const myShare = e.shares.find((s) => s.personId === meId)?.cents ?? 0
  return {
    description: e.description,
    occurredOn: e.occurredOn,
    templateSlug: e.templateSlug,
    methodLabel: e.methodLabel,
    paidByMe: e.payers.length === 1 && e.payers[0]?.personId === meId,
    payerId: e.payers[0]?.personId ?? '',
    myDeltaCents: myPaid - myShare,
  }
}

/** "50/50" when the split is between two, otherwise the plain label ("por %", "entre 3"). */
export function splitShortLabel(methodLabel: string, splitCount: number): string {
  if (methodLabel.startsWith('entre')) return splitCount === 2 ? '50/50' : methodLabel
  return methodLabel
}

/** Two-letter initials of a name ("Mel Pérez" -> "MP", "Ana" -> "A"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]?.charAt(0) ?? ''
  const second = words.length > 1 ? (words[1]?.charAt(0) ?? '') : ''
  return (first + second).toUpperCase()
}

/** Message the person can share to nudge whoever owes them. */
export function reminderMessage(input: {
  debtorNames: readonly string[]
  groupName: string
  amountText: string
}): string {
  const { debtorNames, groupName, amountText } = input
  const who =
    debtorNames.length === 0
      ? 'Hola'
      : debtorNames.length === 1
        ? `Hola ${debtorNames[0]}`
        : 'Hola'
  return `${who}, te recuerdo que quedaron ${amountText} pendientes en el grupo ${groupName} (Moni).`
}

export interface BalanceHeadline {
  /** "Mel te debe", "Le debés a Mel", "Te deben", "Debés" or "Estás al día". */
  label: string
  /** Name of the single other person involved, when there is exactly one. */
  otherName: string | null
  /** Names of everyone who owes me (for the reminder). */
  debtorNames: string[]
}

/** Headline of the group hero, from my net balance and the simplified transfers that involve me. */
export function balanceHeadline(input: {
  myNetCents: Cents
  meId: string
  people: readonly { id: string; name: string }[]
  transfers: readonly { fromUserId: string; toUserId: string }[]
}): BalanceHeadline {
  const { myNetCents, meId, people, transfers } = input
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Alguien'
  if (myNetCents === 0) return { label: 'Estás al día', otherName: null, debtorNames: [] }
  if (myNetCents > 0) {
    const debtors = [...new Set(transfers.filter((t) => t.toUserId === meId).map((t) => nameOf(t.fromUserId)))]
    return debtors.length === 1
      ? { label: `${debtors[0]} te debe`, otherName: debtors[0] ?? null, debtorNames: debtors }
      : { label: 'Te deben', otherName: null, debtorNames: debtors }
  }
  const creditors = [...new Set(transfers.filter((t) => t.fromUserId === meId).map((t) => nameOf(t.toUserId)))]
  return creditors.length === 1
    ? { label: `Le debés a ${creditors[0]}`, otherName: creditors[0] ?? null, debtorNames: [] }
    : { label: 'Debés', otherName: null, debtorNames: [] }
}
