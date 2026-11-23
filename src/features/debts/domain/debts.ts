import { transferNumberLabel, type Account } from '@/features/accounts/domain/account'
import { firstName } from '@/features/auth/domain/profile'
import { suggestTransfers } from '@/features/groups/domain/groupView'
import { memberLabel, type MemberBalance } from '@/features/groups/domain/group'
import type { Cents } from '@/shared/lib/money'
import { formatArs } from '@/shared/lib/money'

/** Direction of a debt from the point of view of the person using the app. */
export type DebtDirection = 'owe' | 'owed'

export type ReportStatus = 'reported' | 'confirmed' | 'rejected' | 'cancelled'

export interface PaymentReport {
  id: string
  groupId: string
  fromUserId: string
  toUserId: string
  amountCents: Cents
  status: ReportStatus
  reportedAt: string
  resolvedAt: string | null
}

export type NoticeKind =
  | 'debt_reminder'
  | 'payment_reported'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'group_invitation'
  | 'invitation_accepted'
  | 'recurring_due'
  | 'group_archived'
  | 'expense_added'

export interface Notice {
  id: string
  kind: NoticeKind
  groupId: string
  groupName: string
  actorId: string
  actorName: string
  /** Zero for the group notices (join requests), which carry no amount. */
  amountCents: Cents
  reportId: string | null
  /** The join request a group notice is about. */
  requestId?: string | null
  /** The direct invitation a group notice is about. */
  invitationId?: string | null
  /** The recurring expense a "recurring_due" notice is about (its name). */
  subject?: string | null
  transferLabel: string | null
  transferAlias: string | null
  transferCbu: string | null
  createdAt: string
  readAt: string | null
}

/** A debt between the person and another member of one group, computed from the real balances. */
export interface PendingDebt {
  /** Stable key: group + both people. */
  key: string
  groupId: string
  groupName: string
  direction: DebtDirection
  otherUserId: string
  otherName: string
  /** A person added by name, without a Moni account: no reminders or payment notices, the payment is recorded in the group. */
  otherIsGuest: boolean
  amountCents: Cents
  /** "Ya pagué" was reported and is waiting for the receiver; null when nothing was reported. */
  report: PaymentReport | null
}

export interface GroupBalances {
  groupId: string
  groupName: string
  balances: readonly MemberBalance[]
  /** Ids of the people without an account among `balances`. */
  guestIds?: ReadonlySet<string>
}

/**
 * Who owes whom, group by group: the same simplification the group screen uses (`suggestTransfers`) over the real
 * balances (shared expenses and settlements), keeping only the payments the person is part of.
 */
export function buildPendingDebts(
  groups: readonly GroupBalances[],
  meId: string,
  reports: readonly PaymentReport[],
): PendingDebt[] {
  const debts: PendingDebt[] = []
  for (const group of groups) {
    const nameOf = (userId: string) => {
      const member = group.balances.find((b) => b.userId === userId)
      return member ? memberLabel(member) : 'Sin nombre'
    }
    for (const t of suggestTransfers(group.balances)) {
      if (t.fromUserId !== meId && t.toUserId !== meId) continue
      const direction: DebtDirection = t.fromUserId === meId ? 'owe' : 'owed'
      const otherUserId = direction === 'owe' ? t.toUserId : t.fromUserId
      const report =
        reports.find(
          (r) =>
            r.status === 'reported' &&
            r.groupId === group.groupId &&
            r.fromUserId === t.fromUserId &&
            r.toUserId === t.toUserId,
        ) ?? null
      debts.push({
        key: `${group.groupId}:${t.fromUserId}:${t.toUserId}`,
        groupId: group.groupId,
        groupName: group.groupName,
        direction,
        otherUserId,
        otherName: nameOf(otherUserId),
        otherIsGuest: group.guestIds?.has(otherUserId) ?? false,
        amountCents: t.amountCents,
        report,
      })
    }
  }
  // The biggest first.
  return debts.sort((a, b) => b.amountCents - a.amountCents)
}

/** What the person decided to share to be paid: one of their own bank / wallet accounts (alias and / or CBU / CVU). */
export interface ReceiveAccount {
  label: string
  alias: string | null
  cbu: string | null
  /** "CBU" for a bank, "CVU" for a wallet. */
  numberLabel: string
  /** "Banco" or "Billetera": how the account is introduced in the message. */
  kindLabel: string
}

/** An account of the person as something to be paid into: only banks and wallets that have transfer data. */
export function toReceiveAccount(account: Account): ReceiveAccount {
  return {
    label: account.name,
    alias: account.transferAlias,
    cbu: account.transferCbu,
    numberLabel: transferNumberLabel(account.kind),
    kindLabel: account.kind === 'wallet' ? 'Billetera' : 'Banco',
  }
}

export function receiveAccountLines(account: ReceiveAccount): string[] {
  const lines: string[] = []
  if (account.alias) lines.push(`Alias: ${account.alias}`)
  if (account.cbu) lines.push(`${account.numberLabel}: ${account.cbu}`)
  return lines
}

/**
 * The message the person who is owed sends (inside Moni, through the device's share menu, or copied): first person, the
 * amount, the group and, only if they chose an account, where to transfer. Without a chosen account it carries no
 * transfer data at all.
 */
export function buildDebtMessage(input: {
  debtorName: string
  groupName: string
  amountCents: Cents
  account: ReceiveAccount | null
}): string {
  const first = firstName(input.debtorName) || input.debtorName
  const lines = [
    `¡Hola, ${first}! Te paso lo que quedó pendiente del grupo ${input.groupName}.`,
    '',
    `Me debés ${formatArs(input.amountCents)}.`,
  ]
  const where = input.account ? receiveAccountLines(input.account) : []
  if (input.account && where.length > 0) {
    lines.push(
      '',
      'Podés transferirme a:',
      `${input.account.kindLabel}: ${input.account.label}`,
      ...where,
    )
  }
  lines.push('', 'Enviado desde Moni')
  return lines.join('\n')
}

/**
 * What the person who is owed shared to be paid, taken from their latest reminder for this debt (the data is the
 * sender's choice and only reaches the addressee). Null when they shared nothing.
 */
export function sharedTransferFor(
  debt: Pick<PendingDebt, 'groupId' | 'otherUserId'>,
  notices: readonly Notice[],
): { label: string | null; alias: string | null; cbu: string | null } | null {
  const latest = notices
    .filter(
      (n) =>
        n.kind === 'debt_reminder' &&
        n.groupId === debt.groupId &&
        n.actorId === debt.otherUserId &&
        (n.transferAlias || n.transferCbu),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
  return latest
    ? { label: latest.transferLabel, alias: latest.transferAlias, cbu: latest.transferCbu }
    : null
}

/** The sentence of a notice, as the person reads it in the inbox. */
export function noticeText(notice: Notice): string {
  const amount = formatArs(notice.amountCents)
  switch (notice.kind) {
    case 'debt_reminder':
      return `${notice.actorName} te recordó que tenés un pago pendiente de ${amount}.`
    case 'payment_reported':
      return `${notice.actorName} indicó que te pagó ${amount}. ¿Recibiste el dinero?`
    case 'payment_confirmed':
      return `${notice.actorName} confirmó tu pago de ${amount}.`
    case 'payment_rejected':
      return `${notice.actorName} todavía no confirmó tu pago de ${amount}.`
    case 'join_request':
      return `${notice.actorName} quiere entrar al grupo ${notice.groupName}.`
    case 'join_approved':
      return `${notice.actorName} te aceptó en el grupo ${notice.groupName}. Ya podés verlo.`
    case 'join_rejected':
      return `Tu solicitud para entrar al grupo ${notice.groupName} no fue aceptada.`
    case 'group_invitation':
      return `${notice.actorName} te invitó al grupo ${notice.groupName}.`
    case 'invitation_accepted':
      return `${notice.actorName} aceptó tu invitación al grupo ${notice.groupName}.`
    case 'expense_added':
      return `${notice.actorName} te incluyó en «${notice.subject ?? 'un gasto'}» de ${notice.groupName}.`
    case 'group_archived':
      return `${notice.actorName} eliminó el grupo ${notice.groupName} para todos. Podés consultar el historial.`
    case 'recurring_due':
      return `Tenés un gasto recurrente para registrar: ${notice.subject ?? 'un gasto del hogar'}.`
  }
}

export function reportStatusLabel(status: ReportStatus): string {
  switch (status) {
    case 'reported':
      return 'Pago informado'
    case 'confirmed':
      return 'Saldada'
    case 'rejected':
      return 'No recibido'
    case 'cancelled':
      return 'Cancelado'
  }
}

/** The preferences for the push notices of the groups (the notices inside Moni are always created). */
export interface NoticePrefs {
  debtReminders: boolean
  paymentsReported: boolean
  paymentsAnswered: boolean
  /** The push shows a generic text instead of names and amounts (for the lock screen). */
  hideDetails: boolean
}

export const DEFAULT_NOTICE_PREFS: NoticePrefs = {
  debtReminders: true,
  paymentsReported: true,
  paymentsAnswered: true,
  hideDetails: false,
}
