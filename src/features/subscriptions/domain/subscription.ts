import { z } from 'zod'
import { formatArs, toCents, type Cents } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'
import type { AccountKind } from '@/shared/lib/database.types'

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'
export type SubscriptionPeriod = 'monthly' | 'yearly'
/**
 * posted: the expense exists | not_charged: the person said it was not charged | linked: replaced by an
 * expense the person had typed | failed: could not be registered (account or category unavailable).
 */
export type ChargeStatus = 'posted' | 'not_charged' | 'linked' | 'failed'

export interface Subscription {
  id: string
  serviceId: string
  name: string
  plan: string | null
  amountCents: Cents
  period: SubscriptionPeriod
  nextChargeOn: IsoDate
  accountId: string
  accountName: string
  accountKind: AccountKind
  categoryId: string
  remind: boolean
  status: SubscriptionStatus
}

export interface PossibleDuplicate {
  id: string
  occurredOn: IsoDate
  note: string | null
  amountCents: Cents
}

export interface SubscriptionCharge {
  id: string
  subscriptionId: string
  dueOn: IsoDate
  amountCents: Cents
  status: ChargeStatus
  /** Voided from Actividad: shown as not charged. */
  voidedElsewhere: boolean
  failureReason: string | null
  /** The account went below zero because of this charge. */
  negativeBalance: boolean
  /** A card charge that took the debt above the card's credit limit. */
  overLimit: boolean
  balanceAfterCents: Cents | null
  possibleDuplicate: PossibleDuplicate | null
}

export interface SubscriptionOverview {
  today: IsoDate
  subscriptions: Subscription[]
  charges: SubscriptionCharge[]
}

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v))

const rawSchema = z.object({
  today: z.string(),
  subscriptions: z.array(
    z.object({
      id: z.string(),
      service_id: z.string(),
      name: z.string(),
      plan: z.string().nullable(),
      amount: money,
      period: z.enum(['monthly', 'yearly']),
      next_charge_on: z.string(),
      account_id: z.string(),
      account_name: z.string(),
      account_kind: z.enum(['cash', 'bank', 'wallet', 'credit_card']),
      category_id: z.string(),
      remind: z.boolean(),
      status: z.enum(['active', 'paused', 'cancelled']),
    }),
  ),
  charges: z.array(
    z.object({
      id: z.string(),
      subscription_id: z.string(),
      due_on: z.string(),
      amount: money,
      status: z.enum(['posted', 'not_charged', 'linked', 'failed']),
      voided_elsewhere: z.boolean().nullable(),
      failure_reason: z.string().nullable(),
      negative_balance: z.boolean(),
      over_limit: z.boolean().nullable(),
      balance_after: money.nullable(),
      possible_duplicate: z
        .object({
          id: z.string(),
          occurred_on: z.string(),
          note: z.string().nullable(),
          amount: money,
        })
        .nullable(),
    }),
  ),
})

/** Validates and converts what public.get_subscription_overview returns (amounts become cents). */
export function parseSubscriptionOverview(raw: unknown): SubscriptionOverview {
  const data = rawSchema.parse(raw)
  return {
    today: data.today,
    subscriptions: data.subscriptions.map((s) => ({
      id: s.id,
      serviceId: s.service_id,
      name: s.name,
      plan: s.plan,
      amountCents: s.amount,
      period: s.period,
      nextChargeOn: s.next_charge_on,
      accountId: s.account_id,
      accountName: s.account_name,
      accountKind: s.account_kind,
      categoryId: s.category_id,
      remind: s.remind,
      status: s.status,
    })),
    charges: data.charges.map((c) => ({
      id: c.id,
      subscriptionId: c.subscription_id,
      dueOn: c.due_on,
      amountCents: c.amount,
      status: c.status,
      voidedElsewhere: c.voided_elsewhere ?? false,
      failureReason: c.failure_reason,
      negativeBalance: c.negative_balance,
      overLimit: c.over_limit ?? false,
      balanceAfterCents: c.balance_after,
      possibleDuplicate: c.possible_duplicate
        ? {
            id: c.possible_duplicate.id,
            occurredOn: c.possible_duplicate.occurred_on,
            note: c.possible_duplicate.note,
            amountCents: c.possible_duplicate.amount,
          }
        : null,
    })),
  }
}

export function withStatus(
  subs: readonly Subscription[],
  status: SubscriptionStatus,
): Subscription[] {
  return subs.filter((s) => s.status === status)
}

/**
 * What each active subscription costs per month; a yearly one counts a twelfth. Estimate in ARS, rounded to
 * whole pesos so the total never shows cents that nobody is charged.
 */
export function monthlyEstimateCents(subs: readonly Subscription[]): Cents {
  const total = withStatus(subs, 'active').reduce(
    (sum, s) => sum + (s.period === 'yearly' ? s.amountCents / 12 : s.amountCents),
    0,
  )
  return Math.round(total / 100) * 100
}

/** Per year: twelve monthly charges, or the yearly one. Estimate, in ARS. */
export function yearlyEstimateCents(subs: readonly Subscription[]): Cents {
  return withStatus(subs, 'active').reduce(
    (sum, s) => sum + (s.period === 'yearly' ? s.amountCents : s.amountCents * 12),
    0,
  )
}

/** Active subscriptions by next charge date (earliest first), then by name. */
export function upcomingCharges(subs: readonly Subscription[]): Subscription[] {
  return withStatus(subs, 'active').sort(
    (a, b) => a.nextChargeOn.localeCompare(b.nextChargeOn) || a.name.localeCompare(b.name),
  )
}

export interface Reminder {
  subscriptionId: string
  text: string
}

/** "Mañana se cobra Netflix: $18.000 de Galicia". */
export function reminderText(
  sub: Pick<Subscription, 'name' | 'amountCents' | 'accountName'>,
): string {
  return `Mañana se cobra ${sub.name}: ${formatArs(sub.amountCents)} de ${sub.accountName}`
}

/** Active subscriptions with reminders on that charge tomorrow (today is the server's Argentina date). */
export function remindersFor(subs: readonly Subscription[], today: IsoDate): Reminder[] {
  const tomorrow = addDays(today, 1)
  return upcomingCharges(subs)
    .filter((s) => s.remind && s.nextChargeOn === tomorrow)
    .map((s) => ({ subscriptionId: s.id, text: reminderText(s) }))
}

/** Charges of one subscription, newest first (the overview already comes sorted). */
export function chargesOf(charges: readonly SubscriptionCharge[], subscriptionId: string) {
  return charges.filter((c) => c.subscriptionId === subscriptionId)
}

/** A charge that counts as money spent: registered and not voided or replaced. */
export function isEffectiveCharge(charge: SubscriptionCharge): boolean {
  return charge.status === 'posted' && !charge.voidedElsewhere
}

/** Charges that need the person's attention (warnings first in the history). */
export function needsAttention(charge: SubscriptionCharge): boolean {
  return (
    (isEffectiveCharge(charge) &&
      (charge.negativeBalance || charge.overLimit || charge.possibleDuplicate !== null)) ||
    charge.status === 'failed'
  )
}
