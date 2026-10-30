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
  'debt_reminder' | 'payment_reported' | 'payment_confirmed' | 'payment_rejected'

export interface Notice {
  id: string
  kind: NoticeKind
  groupId: string
  groupName: string
  actorId: string
  actorName: string
  amountCents: Cents
  reportId: string | null
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
  amountCents: Cents
  /** "Ya pagué" was reported and is waiting for the receiver; null when nothing was reported. */
  report: PaymentReport | null
}

export interface GroupBalances {
  groupId: string
  groupName: string
  balances: readonly MemberBalance[]
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
      return `${notice.actorName} te recuerda que le debés ${amount} del grupo ${notice.groupName}.`
    case 'payment_reported':
      return `${notice.actorName} informó que te pagó ${amount} del grupo ${notice.groupName}. ¿Lo recibiste?`
    case 'payment_confirmed':
      return `${notice.actorName} confirmó que recibió tu pago de ${amount} del grupo ${notice.groupName}.`
    case 'payment_rejected':
      return `${notice.actorName} dice que todavía no recibió tu pago de ${amount} del grupo ${notice.groupName}.`
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
