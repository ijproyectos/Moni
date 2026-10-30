import { fromCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import {
  parseSubscriptionOverview,
  type SubscriptionOverview,
  type SubscriptionPeriod,
  type SubscriptionStatus,
} from '../domain/subscription'

const toNumeric = (cents: Cents) => Number(fromCents(cents))

export interface SubscriptionInput {
  serviceId: string
  name: string
  plan: string | null
  amountCents: Cents
  period: SubscriptionPeriod
  nextChargeOn: IsoDate
  accountId: string
  categoryId: string
  remind: boolean
}

/** Subscriptions, upcoming charges and history, all computed by the database for the caller. */
export async function getSubscriptionOverview(): Promise<SubscriptionOverview> {
  const { data, error } = await getSupabase().rpc('get_subscription_overview')
  if (error) throw error
  return parseSubscriptionOverview(data)
}

/** Registers the charges that are due today or earlier (the server job does the same; this is a safety net). */
export async function processMyDueSubscriptions(): Promise<number> {
  const { data, error } = await getSupabase().rpc('process_my_due_subscriptions')
  if (error) throw error
  return data ?? 0
}

export async function createSubscription(
  input: SubscriptionInput,
  requestKey: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_subscription', {
    p_service: input.serviceId,
    p_name: input.name,
    p_plan: input.plan,
    p_amount: toNumeric(input.amountCents),
    p_period: input.period,
    p_next_on: input.nextChargeOn,
    p_account: input.accountId,
    p_category: input.categoryId,
    p_remind: input.remind,
    p_request_key: requestKey,
  })
  if (error) throw error
  return data
}

export async function updateSubscription(id: string, input: SubscriptionInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_subscription', {
    p_id: id,
    p_name: input.name,
    p_plan: input.plan,
    p_amount: toNumeric(input.amountCents),
    p_period: input.period,
    p_next_on: input.nextChargeOn,
    p_account: input.accountId,
    p_category: input.categoryId,
    p_remind: input.remind,
  })
  if (error) throw error
}

export async function setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void> {
  const { error } = await getSupabase().rpc('set_subscription_status', {
    p_id: id,
    p_status: status,
  })
  if (error) throw error
}

/** "Anular cobro" (the charge is then listed as "Sin cobro"): voids the automatic expense and keeps the charge as the record. */
export async function markChargeNotCharged(chargeId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_subscription_charge_not_charged', {
    p_charge: chargeId,
  })
  if (error) throw error
}

/** "Ya lo cargué": the automatic expense is voided and the charge points to the one the person typed. */
export async function linkChargeToExpense(chargeId: string, transactionId: string): Promise<void> {
  const { error } = await getSupabase().rpc('link_subscription_charge', {
    p_charge: chargeId,
    p_transaction: transactionId,
  })
  if (error) throw error
}

export async function dismissDuplicate(chargeId: string): Promise<void> {
  const { error } = await getSupabase().rpc('dismiss_subscription_duplicate', {
    p_charge: chargeId,
  })
  if (error) throw error
}
