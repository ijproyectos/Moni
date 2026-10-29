import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { dueFor } from './cardCalendar'

export interface PlanRow {
  id: string
  accountId: string
  description: string
  totalCents: Cents
  count: number
  firstNumber: number
}

export interface PlanInstallmentRow {
  planId: string
  number: number
  amountCents: Cents
  /** Closing date of the statement the installment belongs to (also its date in reports). */
  closingOn: IsoDate
}

/** An installment purchase as the "Cuotas" screen shows it. */
export interface InstallmentPlanView {
  id: string
  accountId: string
  description: string
  count: number
  /** Installments already behind: the ones before "voy en la N" plus the statements already closed. */
  paid: number
  /** Amount of the next installment to come (the last one if none is left). */
  installmentCents: Cents
  /** Sum of the installments still to come. */
  remainingCents: Cents
  /** Month the last installment is due. */
  endsOn: IsoDate
}

/**
 * Joins plans with their installments. An installment is behind once its statement has closed
 * (closing date before today); the rest are scheduled.
 */
export function buildPlanViews(input: {
  plans: readonly PlanRow[]
  installments: readonly PlanInstallmentRow[]
  dueDayByAccount: ReadonlyMap<string, number | null>
  today: IsoDate
}): InstallmentPlanView[] {
  const views: InstallmentPlanView[] = []
  for (const plan of input.plans) {
    const rows = input.installments
      .filter((r) => r.planId === plan.id)
      .sort((a, b) => a.number - b.number)
    const last = rows[rows.length - 1]
    if (!last) continue
    const upcoming = rows.filter((r) => r.closingOn >= input.today)
    const dueDay = input.dueDayByAccount.get(plan.accountId) ?? null
    views.push({
      id: plan.id,
      accountId: plan.accountId,
      description: plan.description,
      count: plan.count,
      paid: plan.firstNumber - 1 + (rows.length - upcoming.length),
      installmentCents: (upcoming[0] ?? last).amountCents,
      remainingCents: upcoming.reduce((sum, r) => sum + r.amountCents, 0),
      endsOn: dueDay === null ? last.closingOn : dueFor(last.closingOn, dueDay),
    })
  }
  return views.sort((a, b) => a.endsOn.localeCompare(b.endsOn))
}
