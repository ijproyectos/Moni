import {
  Car,
  GraduationCap,
  House,
  Laptop,
  LifeBuoy,
  Plane,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { z } from 'zod'
import { formatArs, toCents, type Cents } from '@/shared/lib/money'
import { addDays, daysInMonth, weekdayIndex, type IsoDate } from '@/shared/lib/month'
import type { AccountKind } from '@/shared/lib/database.types'

// Savings goals: virtual reservations of money that already sits in a real account. A reservation never moves money;
// it only splits an account's real balance into "reserved for goals" and "free to spend".

export type SavingsIconId =
  'viaje' | 'auto' | 'casa' | 'computadora' | 'emergencia' | 'estudios' | 'otra'
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived'
export type GoalFrequency = 'weekly' | 'biweekly' | 'monthly' | 'free'

export interface SavingsKind {
  id: SavingsIconId
  label: string
  /** Name proposed when the kind is picked. */
  suggestedName: string
  icon: LucideIcon
  bg: string
  color: string
}

export const SAVINGS_KINDS: readonly SavingsKind[] = [
  {
    id: 'viaje',
    label: 'Viaje',
    suggestedName: 'Viaje',
    icon: Plane,
    bg: '#e3f2cf',
    color: '#064735',
  },
  { id: 'auto', label: 'Auto', suggestedName: 'Auto', icon: Car, bg: '#fdeab8', color: '#064735' },
  {
    id: 'casa',
    label: 'Casa',
    suggestedName: 'Casa',
    icon: House,
    bg: '#fdeab8',
    color: '#064735',
  },
  {
    id: 'computadora',
    label: 'Computadora',
    suggestedName: 'Computadora',
    icon: Laptop,
    bg: '#e3f2cf',
    color: '#064735',
  },
  {
    id: 'emergencia',
    label: 'Emergencia',
    suggestedName: 'Fondo de emergencia',
    icon: LifeBuoy,
    bg: '#d9ebe4',
    color: '#064735',
  },
  {
    id: 'estudios',
    label: 'Estudios',
    suggestedName: 'Estudios',
    icon: GraduationCap,
    bg: '#fbdcd7',
    color: '#b8321f',
  },
  { id: 'otra', label: 'Otra', suggestedName: '', icon: Target, bg: '#fdeab8', color: '#064735' },
]

const KIND_BY_ID = new Map(SAVINGS_KINDS.map((k) => [k.id, k]))

/** An unknown icon key (a newer app version, say) falls back to the generic target. */
export function savingsKind(id: string): SavingsKind {
  return KIND_BY_ID.get(id as SavingsIconId) ?? (KIND_BY_ID.get('otra') as SavingsKind)
}

export const FREQUENCY_LABELS: Record<GoalFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Cada 15 días',
  monthly: 'Mensual',
  free: 'Cuando quiera',
}

export interface SavingsGoal {
  id: string
  name: string
  icon: string
  targetCents: Cents
  accountId: string
  accountName: string
  accountKind: AccountKind
  /** The account is active and not a credit card: deposits are possible. */
  accountUsable: boolean
  targetDate: IsoDate | null
  frequency: GoalFrequency
  /** Orientative amount per contribution. Optional: reminders work without it. */
  suggestedCents: Cents | null
  remind: boolean
  /** First reminder of the series (its weekday or day of month is the schedule). */
  anchorOn: IsoDate | null
  nextReminderOn: IsoDate | null
  /** The date the reminder counts for now (snoozed or scheduled); null when the goal does not remind. */
  reminderOn: IsoDate | null
  status: GoalStatus
  reservedCents: Cents
}

export interface SavingsAccount {
  id: string
  name: string
  kind: AccountKind
  archived: boolean
  balanceCents: Cents
  reservedCents: Cents
  /** Real balance minus what the goals reserve; negative when the balance no longer covers the reserves. */
  freeCents: Cents
}

export interface SavingsMovement {
  id: string
  goalId: string
  kind: 'deposit' | 'withdrawal'
  amountCents: Cents
  occurredOn: IsoDate
  note: string | null
  status: 'posted' | 'voided'
}

export interface SavingsOverview {
  today: IsoDate
  goals: SavingsGoal[]
  accounts: SavingsAccount[]
  movements: SavingsMovement[]
}

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v))

const rawSchema = z.object({
  today: z.string(),
  goals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      target_amount: money,
      account_id: z.string(),
      account_name: z.string(),
      account_kind: z.enum(['cash', 'bank', 'wallet', 'credit_card']),
      account_usable: z.boolean(),
      target_date: z.string().nullable(),
      frequency: z.enum(['weekly', 'biweekly', 'monthly', 'free']),
      suggested_amount: money.nullable(),
      remind: z.boolean(),
      anchor_on: z.string().nullable(),
      next_reminder_on: z.string().nullable(),
      reminder_on: z.string().nullable(),
      status: z.enum(['active', 'paused', 'completed', 'archived']),
      reserved: money,
    }),
  ),
  accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['cash', 'bank', 'wallet', 'credit_card']),
      archived: z.boolean(),
      balance: money,
      reserved: money,
      free: money,
    }),
  ),
  movements: z.array(
    z.object({
      id: z.string(),
      goal_id: z.string(),
      kind: z.enum(['deposit', 'withdrawal']),
      amount: money,
      occurred_on: z.string(),
      note: z.string().nullable(),
      status: z.enum(['posted', 'voided']),
    }),
  ),
})

/** Validates and converts what public.get_savings_overview returns (amounts become cents). */
export function parseSavingsOverview(raw: unknown): SavingsOverview {
  const data = rawSchema.parse(raw)
  return {
    today: data.today,
    goals: data.goals.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      targetCents: g.target_amount,
      accountId: g.account_id,
      accountName: g.account_name,
      accountKind: g.account_kind,
      accountUsable: g.account_usable,
      targetDate: g.target_date,
      frequency: g.frequency,
      suggestedCents: g.suggested_amount,
      remind: g.remind,
      anchorOn: g.anchor_on,
      nextReminderOn: g.next_reminder_on,
      reminderOn: g.reminder_on,
      status: g.status,
      reservedCents: g.reserved,
    })),
    accounts: data.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      archived: a.archived,
      balanceCents: a.balance,
      reservedCents: a.reserved,
      freeCents: a.free,
    })),
    movements: data.movements.map((m) => ({
      id: m.id,
      goalId: m.goal_id,
      kind: m.kind,
      amountCents: m.amount,
      occurredOn: m.occurred_on,
      note: m.note,
      status: m.status,
    })),
  }
}

// Progress ---------------------------------------------------------------------------------------------------

/** Reserved / target, uncapped: 1.3 means 130 %. */
export function ratioOf(goal: Pick<SavingsGoal, 'reservedCents' | 'targetCents'>): number {
  return goal.targetCents > 0 ? goal.reservedCents / goal.targetCents : 0
}

/** For the progress bar: never above 1 (a goal beyond 100 % shows a full bar and the real percentage as text). */
export function barValue(goal: Pick<SavingsGoal, 'reservedCents' | 'targetCents'>): number {
  return Math.min(1, Math.max(0, ratioOf(goal)))
}

export function percentText(goal: Pick<SavingsGoal, 'reservedCents' | 'targetCents'>): string {
  return `${Math.floor(Math.max(0, ratioOf(goal)) * 100)}%`
}

export function missingCents(goal: Pick<SavingsGoal, 'reservedCents' | 'targetCents'>): Cents {
  return Math.max(0, goal.targetCents - goal.reservedCents)
}

export function exceededCents(goal: Pick<SavingsGoal, 'reservedCents' | 'targetCents'>): Cents {
  return Math.max(0, goal.reservedCents - goal.targetCents)
}

export function goalsByStatus(
  goals: readonly SavingsGoal[],
  ...statuses: GoalStatus[]
): SavingsGoal[] {
  return goals.filter((g) => statuses.includes(g.status))
}

/** Totals of the active goals, for the summary card. */
export function activeTotals(goals: readonly SavingsGoal[]): {
  reservedCents: Cents
  targetCents: Cents
  count: number
} {
  const active = goals.filter((g) => g.status === 'active')
  return {
    reservedCents: active.reduce((s, g) => s + g.reservedCents, 0),
    targetCents: active.reduce((s, g) => s + g.targetCents, 0),
    count: active.length,
  }
}

// Alerts: one per account whose balance no longer covers what its goals reserve ---------------------------------------

export interface SavingsAlert {
  accountId: string
  accountName: string
  reservedCents: Cents
  balanceCents: Cents
  /** What is missing to cover every reserve. */
  shortfallCents: Cents
  /** Goals with money reserved in that account. */
  goals: SavingsGoal[]
}

/** "¡Ojo con tus ahorros!": derived from the real balance, so it appears whatever lowered it, and it is one per account. */
export function savingsAlerts(
  overview: Pick<SavingsOverview, 'accounts' | 'goals'>,
): SavingsAlert[] {
  return overview.accounts
    .filter((a) => a.reservedCents > 0 && a.balanceCents < a.reservedCents)
    .map((a) => ({
      accountId: a.id,
      accountName: a.name,
      reservedCents: a.reservedCents,
      balanceCents: a.balanceCents,
      shortfallCents: a.reservedCents - a.balanceCents,
      goals: overview.goals.filter(
        (g) => g.accountId === a.id && g.status !== 'archived' && g.reservedCents > 0,
      ),
    }))
}

export function alertText(
  alert: Pick<SavingsAlert, 'accountName' | 'reservedCents' | 'balanceCents' | 'shortfallCents'>,
): string {
  return (
    `¡Ojo con tus ahorros! Tenés ${formatArs(alert.reservedCents)} reservados para tus metas en ${alert.accountName}, ` +
    `pero tu saldo actual es de ${formatArs(alert.balanceCents)}. Te faltan ${formatArs(alert.shortfallCents)} para cubrirlos.`
  )
}

export interface SavingsCommittedWarning {
  accountName: string
  reservedCents: Cents
  /** Balance before the movement. */
  balanceCents: Cents
  amountCents: Cents
  /** Balance after the movement. */
  resultingCents: Cents
  /** What would be missing to cover the reserves after it. */
  shortfallCents: Cents
}

/**
 * Before a spend, transfer or payment: does it leave the account under what its goals reserve? Returns the numbers
 * for the warning (which never blocks), or null when the reserves stay covered or nothing is reserved.
 * `releasedCents` is the amount of a movement being edited (already counted in the balance).
 */
export function checkSavingsCommitted(input: {
  accountName: string
  balanceCents: Cents
  reservedCents: Cents
  amountCents: Cents
  releasedCents?: Cents
}): SavingsCommittedWarning | null {
  if (input.reservedCents <= 0) return null
  const balanceCents = input.balanceCents + (input.releasedCents ?? 0)
  const resultingCents = balanceCents - input.amountCents
  if (resultingCents >= input.reservedCents) return null
  return {
    accountName: input.accountName,
    reservedCents: input.reservedCents,
    balanceCents,
    amountCents: input.amountCents,
    resultingCents,
    shortfallCents: input.reservedCents - resultingCents,
  }
}

// Reminders ------------------------------------------------------------------------------------------------------------

export interface GoalReminder {
  goal: SavingsGoal
  /** Due today (or earlier, if the person has not answered yet). */
  overdue: boolean
  text: string
}

/** "Hoy te propusiste ahorrar $30.000 para tu viaje. ¿Querés agregar un aporte?" One per goal that is due. */
export function reminderText(
  goal: Pick<SavingsGoal, 'name' | 'suggestedCents'>,
  overdue: boolean,
): string {
  const lead = overdue ? 'Te propusiste' : 'Hoy te propusiste'
  return goal.suggestedCents !== null
    ? `${lead} ahorrar ${formatArs(goal.suggestedCents)} para ${goal.name}. ¿Querés agregar un aporte?`
    : `${overdue ? 'Quedó pendiente tu' : 'Hoy es tu'} momento de ahorrar para ${goal.name}. ¿Querés agregar un aporte?`
}

/** Active goals whose reminder date has arrived. Paused, completed and archived goals never remind. */
export function goalReminders(overview: Pick<SavingsOverview, 'goals' | 'today'>): GoalReminder[] {
  return overview.goals
    .filter(
      (g) =>
        g.status === 'active' &&
        g.remind &&
        g.reminderOn !== null &&
        g.reminderOn <= overview.today,
    )
    .map((goal) => {
      const overdue = (goal.reminderOn as IsoDate) < overview.today
      return { goal, overdue, text: reminderText(goal, overdue) }
    })
    .sort((a, b) => a.goal.name.localeCompare(b.goal.name))
}

export const WEEKDAYS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const

/** Next date (today included) that falls on that weekday (0 = Monday). */
export function nextWeekday(weekday: number, today: IsoDate): IsoDate {
  const delta = (weekday - weekdayIndex(today) + 7) % 7
  return addDays(today, delta)
}

/** Next date (today included) with that day of the month; a short month uses its last day. */
export function nextMonthDay(day: number, today: IsoDate): IsoDate {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const clamp = (year: number, month: number) =>
    Math.min(day, daysInMonth(`${year}-${String(month).padStart(2, '0')}-01`))
  const thisMonth = clamp(y, m)
  if (thisMonth >= d)
    return `${y}-${String(m).padStart(2, '0')}-${String(thisMonth).padStart(2, '0')}`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-${String(clamp(ny, nm)).padStart(2, '0')}`
}

/** "Todos los viernes", "Cada 15 días, los viernes" or "El día 5 de cada mes". */
export function describeSchedule(
  frequency: GoalFrequency,
  anchorOn: IsoDate | null,
): string | null {
  if (frequency === 'free' || anchorOn === null) return null
  if (frequency === 'monthly') return `El día ${Number(anchorOn.slice(8, 10))} de cada mes`
  const day = WEEKDAYS[weekdayIndex(anchorOn)]
  return frequency === 'weekly' ? `Todos los ${day}` : `Cada 15 días, los ${day}`
}

/** How the goal's next reminder reads in its card; null when it does not remind. */
export function nextReminderLabel(
  goal: Pick<SavingsGoal, 'status' | 'remind' | 'reminderOn'>,
  today: IsoDate,
): string | null {
  if (goal.status !== 'active' || !goal.remind || goal.reminderOn === null) return null
  if (goal.reminderOn <= today) return 'Recordatorio: hoy'
  return `Recordatorio: ${goal.reminderOn.slice(8, 10)}/${goal.reminderOn.slice(5, 7)}`
}
