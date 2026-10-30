import { fromCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import {
  parseSavingsOverview,
  type GoalFrequency,
  type GoalStatus,
  type SavingsOverview,
} from '../domain/savings'

const toNumeric = (cents: Cents) => Number(fromCents(cents))

export interface SavingsGoalInput {
  name: string
  icon: string
  targetCents: Cents
  accountId: string
  targetDate: IsoDate | null
  frequency: GoalFrequency
  /** Optional orientative amount. */
  suggestedCents: Cents | null
  remind: boolean
  /** First reminder of the series; its weekday / day of month is the schedule. */
  firstReminderOn: IsoDate | null
}

/** Goals, the per-account split (balance, reserved, free) and the latest movements, computed by the database. */
export async function getSavingsOverview(): Promise<SavingsOverview> {
  const { data, error } = await getSupabase().rpc('get_savings_overview')
  if (error) throw error
  return parseSavingsOverview(data)
}

export async function createSavingsGoal(
  input: SavingsGoalInput & { initialCents: Cents | null },
  requestKey: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_savings_goal', {
    p_name: input.name,
    p_icon: input.icon,
    p_target: toNumeric(input.targetCents),
    p_account: input.accountId,
    p_target_date: input.targetDate,
    p_initial: input.initialCents ? toNumeric(input.initialCents) : null,
    p_frequency: input.frequency,
    p_suggested: input.suggestedCents ? toNumeric(input.suggestedCents) : null,
    p_remind: input.remind,
    p_first_reminder_on: input.remind ? input.firstReminderOn : null,
    p_request_key: requestKey,
  })
  if (error) throw error
  return data
}

export async function updateSavingsGoal(id: string, input: SavingsGoalInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_savings_goal', {
    p_goal: id,
    p_name: input.name,
    p_icon: input.icon,
    p_target: toNumeric(input.targetCents),
    p_account: input.accountId,
    p_target_date: input.targetDate,
    p_frequency: input.frequency,
    p_suggested: input.suggestedCents ? toNumeric(input.suggestedCents) : null,
    p_remind: input.remind,
    p_first_reminder_on: input.remind ? input.firstReminderOn : null,
  })
  if (error) throw error
}

export async function setGoalStatus(
  id: string,
  status: GoalStatus,
  release = false,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_savings_goal_status', {
    p_goal: id,
    p_status: status,
    p_release: release,
  })
  if (error) throw error
}

/** Reserves money for the goal (virtual: nothing is spent or moved). Retries with the same key are safe. */
export async function addDeposit(input: {
  goalId: string
  amountCents: Cents
  requestKey: string
  note?: string
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('add_goal_deposit', {
    p_goal: input.goalId,
    p_amount: toNumeric(input.amountCents),
    p_on: null,
    p_note: input.note ?? null,
    p_request_key: input.requestKey,
  })
  if (error) throw error
  return data
}

/** Lowers the goal's reserve. The money never moved, so no balance changes. */
export async function withdrawReserve(input: {
  goalId: string
  amountCents: Cents
  requestKey: string
  note?: string
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('withdraw_goal_reserve', {
    p_goal: input.goalId,
    p_amount: toNumeric(input.amountCents),
    p_on: null,
    p_note: input.note ?? null,
    p_request_key: input.requestKey,
  })
  if (error) throw error
  return data
}

export async function voidMovement(movementId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_goal_movement', { p_movement: movementId })
  if (error) throw error
}

export async function snoozeReminder(goalId: string, until: IsoDate): Promise<void> {
  const { error } = await getSupabase().rpc('snooze_goal_reminder', {
    p_goal: goalId,
    p_until: until,
  })
  if (error) throw error
}

export async function skipReminder(goalId: string): Promise<void> {
  const { error } = await getSupabase().rpc('skip_goal_reminder', { p_goal: goalId })
  if (error) throw error
}
