import type { NotificationRow, PaymentReportRow } from '@/shared/lib/database.types'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type { Notice, PaymentReport, ReceiveAccount } from '../domain/debts'

const toNumeric = (cents: number) => Number(fromCents(cents))

function toReport(row: PaymentReportRow): PaymentReport {
  return {
    id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user,
    toUserId: row.to_user,
    amountCents: toCents(row.amount),
    status: row.status,
    reportedAt: row.reported_at,
    resolvedAt: row.resolved_at,
  }
}

function toNotice(row: NotificationRow): Notice {
  return {
    id: row.id,
    kind: row.kind,
    groupId: row.group_id,
    groupName: row.group_name,
    actorId: row.actor_id,
    actorName: row.actor_name,
    amountCents: toCents(row.amount),
    reportId: row.report_id,
    transferLabel: row.transfer_label,
    transferAlias: row.transfer_alias,
    transferCbu: row.transfer_cbu,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

/** PostgREST / Postgres answer these when the debts migration has not been applied yet. */
export function isDebtsNotEnabled(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01'
}

/** The payments the person reported or has to confirm (RLS: only the ones they are part of), newest first. */
export async function listPaymentReports(): Promise<PaymentReport[]> {
  const { data, error } = await getSupabase()
    .from('payment_reports')
    .select('*')
    .order('reported_at', { ascending: false })
  if (error) throw error
  return data.map(toReport)
}

/** The person's own notifications, newest first. */
export async function listNotices(): Promise<Notice[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data.map(toNotice)
}

export async function markNoticesRead(): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

/** Sends the reminder inside Moni. `account` is only what the person chose and confirmed to share. */
export async function remindDebt(input: {
  groupId: string
  debtorId: string
  amountCents: number
  account: ReceiveAccount | null
}): Promise<void> {
  const { error } = await getSupabase().rpc('remind_debt', {
    p_group: input.groupId,
    p_debtor: input.debtorId,
    p_amount: toNumeric(input.amountCents),
    p_transfer_label: input.account?.label ?? null,
    p_transfer_alias: input.account?.alias ?? null,
    p_transfer_cbu: input.account?.cbu ?? null,
  })
  if (error) throw error
}

export async function reportPayment(input: {
  groupId: string
  creditorId: string
  amountCents: number
}): Promise<void> {
  const { error } = await getSupabase().rpc('report_payment', {
    p_group: input.groupId,
    p_creditor: input.creditorId,
    p_amount: toNumeric(input.amountCents),
  })
  if (error) throw error
}

/** Returns true when the debt was settled, false when it had already been settled another way (nothing is recorded twice). */
export async function confirmPaymentReport(reportId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('confirm_payment_report', { p_report: reportId })
  if (error) throw error
  return data !== null
}

export async function rejectPaymentReport(reportId: string): Promise<void> {
  const { error } = await getSupabase().rpc('reject_payment_report', { p_report: reportId })
  if (error) throw error
}

export async function cancelPaymentReport(reportId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_payment_report', { p_report: reportId })
  if (error) throw error
}
