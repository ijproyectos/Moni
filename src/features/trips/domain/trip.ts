import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import type { Cents } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'
import type { Transaction } from '@/features/transactions/domain/transaction'
import { daysBetween } from './dates'

/** A personal trip: only its owner sees it. Its expenses are ordinary movements that point to it. */
export interface PersonalTrip {
  id: string
  name: string
  startsOn: IsoDate
  endsOn: IsoDate
  budgetCents: Cents
  archivedAt: string | null
}

/** Dates and budget of a group trip (the group itself, its members and its expenses live in Grupos). */
export interface GroupTripInfo {
  groupId: string
  startsOn: IsoDate
  endsOn: IsoDate
  budgetCents: Cents
}

export interface TripFormValues {
  name: string
  startsOn: IsoDate
  endsOn: IsoDate
  budgetCents: Cents
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Form text -> values. The budget is typed es-AR style ("1.500.000"). */
export const tripFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Contanos a dónde vas.').max(60, 'Máximo 60 caracteres.'),
    startsOn: z.string().regex(ISO_DATE, 'Elegí cuándo salís.'),
    endsOn: z.string().regex(ISO_DATE, 'Elegí cuándo volvés.'),
    budget: z.string().transform((text, ctx) => {
      const cents = parseAmountInput(text)
      if (cents === null || cents <= 0) {
        ctx.addIssue({ code: 'custom', message: 'Poné un presupuesto.' })
        return z.NEVER
      }
      return cents
    }),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: 'La vuelta no puede ser antes de la ida.',
    path: ['endsOn'],
  })
  .transform(({ budget, ...rest }): TripFormValues => ({ ...rest, budgetCents: budget }))

export type TripStatus = 'upcoming' | 'ongoing' | 'ended'

export interface CategorySpend {
  categoryId: string | null
  cents: Cents
  /** Share of what was spent (0..1). */
  share: number
}

export interface TripSummary {
  status: TripStatus
  spentCents: Cents
  /** Budget minus spent; negative when the budget was exceeded. */
  remainingCents: Cents
  /** Spent / budget (0 when the budget is 0), may be above 1. */
  progress: number
  overBudget: boolean
  expenseCount: number
  /** Days of the trip, and days left counting today (0 once it ended, the whole trip before it starts). */
  totalDays: number
  daysLeft: number
  /** What is left to spend per remaining day (0 when over budget or when nothing is left of the trip). */
  perDayCents: Cents
  byCategory: CategorySpend[]
}

export function tripStatus(
  trip: { startsOn: IsoDate; endsOn: IsoDate },
  today: IsoDate,
): TripStatus {
  if (today < trip.startsOn) return 'upcoming'
  if (today > trip.endsOn) return 'ended'
  return 'ongoing'
}

/** Expenses that belong to the trip and still count (posted, plain expenses). */
export function tripExpenses(tripId: string, transactions: readonly Transaction[]): Transaction[] {
  return transactions.filter(
    (t) => t.tripId === tripId && t.kind === 'expense' && t.status === 'posted',
  )
}

/**
 * How the trip goes against its budget. Everything is derived from the real movements of the trip, so nothing is
 * stored twice: voiding or editing a movement changes these numbers by itself.
 */
export function summarizeTrip(
  trip: Pick<PersonalTrip, 'startsOn' | 'endsOn' | 'budgetCents'>,
  expenses: readonly Transaction[],
  today: IsoDate,
): TripSummary {
  const status = tripStatus(trip, today)
  const spentCents = expenses.reduce((sum, t) => sum + t.amountCents, 0)
  const totalDays = daysBetween(trip.startsOn, trip.endsOn)
  const daysLeft =
    status === 'ended' ? 0 : status === 'upcoming' ? totalDays : daysBetween(today, trip.endsOn)
  const remainingCents = trip.budgetCents - spentCents

  const totals = new Map<string | null, Cents>()
  for (const t of expenses)
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents)
  const byCategory = [...totals.entries()]
    .map(([categoryId, cents]) => ({
      categoryId,
      cents,
      share: spentCents > 0 ? cents / spentCents : 0,
    }))
    .sort((a, b) => b.cents - a.cents)

  return {
    status,
    spentCents,
    remainingCents,
    progress: trip.budgetCents > 0 ? spentCents / trip.budgetCents : 0,
    overBudget: spentCents > trip.budgetCents,
    expenseCount: expenses.length,
    totalDays,
    daysLeft,
    perDayCents: remainingCents > 0 && daysLeft > 0 ? Math.floor(remainingCents / daysLeft) : 0,
    byCategory,
  }
}

/** Where the new-trip form starts: a month from now, five days long. */
export function defaultTripDates(today: IsoDate): { startsOn: IsoDate; endsOn: IsoDate } {
  return { startsOn: addDays(today, 30), endsOn: addDays(today, 34) }
}

/** Short line about where the trip stands in time: "Faltan 12 días", "En curso · 3 días más", "Terminó". */
export function tripTimeLabel(
  trip: Pick<PersonalTrip, 'startsOn'>,
  summary: TripSummary,
  today: string,
) {
  if (summary.status === 'upcoming') {
    const away = daysBetween(today, trip.startsOn) - 1
    return away === 1 ? 'Falta 1 día' : `Faltan ${away} días`
  }
  if (summary.status === 'ended') return 'Terminó'
  return summary.daysLeft <= 1 ? 'Último día' : `Quedan ${summary.daysLeft} días`
}
