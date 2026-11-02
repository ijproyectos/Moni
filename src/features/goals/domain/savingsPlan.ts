import { z } from 'zod'
import { formatMonthShortYear, monthNameOf } from '@/shared/lib/dates'
import { formatArs, toCents, type Cents } from '@/shared/lib/money'
import { monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'
import type { SavingsGoal } from './savings'

// Savings plan: how much a person saved each month (real contributions and withdrawals) against how much the goals
// asked them to save. Everything is derived from the goals and the monthly movements the database reports; nothing is
// invented. Amounts are integer cents; months are the first day of the month ("2026-11-01").

/** What the database reports per goal and month (public.get_savings_plan_data). */
export interface MonthlyRow {
  goalId: string
  month: IsoDate
  depositedCents: Cents
  /** Money the person took out of the goal. */
  withdrawnCents: Cents
  /** Reserve freed by marking a goal completed or archived: neither saving nor spending. */
  releasedCents: Cents
}

export interface GoalLife {
  createdAt: string
  completedAt: string | null
  archivedAt: string | null
  pausedAt: string | null
}

export interface PlanData {
  months: MonthlyRow[]
  lives: Record<string, GoalLife>
}

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v))
const rawPlan = z.object({
  months: z.array(
    z.object({
      goal_id: z.string(),
      month: z.string(),
      deposited: money,
      withdrawn: money,
      released: money,
    }),
  ),
  goals: z.array(
    z.object({
      id: z.string(),
      created_at: z.string(),
      completed_at: z.string().nullable(),
      archived_at: z.string().nullable(),
      paused_at: z.string().nullable(),
    }),
  ),
})

/** Validates and converts what public.get_savings_plan_data returns. */
export function parsePlanData(raw: unknown): PlanData {
  const data = rawPlan.parse(raw)
  return {
    months: data.months.map((m) => ({
      goalId: m.goal_id,
      month: monthStart(m.month),
      depositedCents: m.deposited,
      withdrawnCents: m.withdrawn,
      releasedCents: m.released,
    })),
    lives: Object.fromEntries(
      data.goals.map((g) => [
        g.id,
        {
          createdAt: g.created_at,
          completedAt: g.completed_at,
          archivedAt: g.archived_at,
          pausedAt: g.paused_at,
        },
      ]),
    ),
  }
}

export interface PlanInput {
  today: IsoDate
  goals: readonly SavingsGoal[]
  data: PlanData
}

// Months --------------------------------------------------------------------------------------------------------

/** Whole months from `a` to `b` (both month starts); negative when `b` is earlier. */
export function monthsBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am] = a.split('-').map(Number) as [number, number]
  const [by, bm] = b.split('-').map(Number) as [number, number]
  return (by - ay) * 12 + (bm - am)
}

const lifeMonth = (iso: string | null): IsoDate | null =>
  iso ? monthStart(iso.slice(0, 10)) : null

/** Net movement of one goal in one month, including what a status change released. */
function netOf(row: MonthlyRow): Cents {
  return row.depositedCents - row.withdrawnCents - row.releasedCents
}

/** What the goal had reserved on the first day of `month`, rebuilt from every movement before it. */
export function reservedAtStart(
  goalId: string,
  month: IsoDate,
  rows: readonly MonthlyRow[],
): Cents {
  let total = 0
  for (const row of rows) if (row.goalId === goalId && row.month < month) total += netOf(row)
  return Math.max(0, total)
}

/**
 * The month the goal started to exist: when it was created, or earlier when it already has movements dated before
 * (a contribution can be dated in the past), so those months are never reported as "no goals yet".
 */
function startMonth(
  goalId: string,
  life: GoalLife | undefined,
  rows: readonly MonthlyRow[],
): IsoDate | null {
  let start = lifeMonth(life?.createdAt ?? null)
  for (const row of rows)
    if (row.goalId === goalId && (!start || row.month < start)) start = row.month
  return start
}

/** The goal took part in the plan of `month`: it existed, and was neither completed, archived nor paused before. */
function inPlan(goal: SavingsGoal, life: GoalLife | undefined, month: IsoDate): boolean {
  // The plan starts the month the goal was created: nothing was asked before the goal existed, even if the person
  // later dated a contribution earlier.
  const created = lifeMonth(life?.createdAt ?? null)
  if (created && month < created) return false
  const completed = lifeMonth(life?.completedAt ?? null)
  if (goal.status === 'completed' && completed && month > completed) return false
  const archived = lifeMonth(life?.archivedAt ?? null)
  if (goal.status === 'archived' && archived && month > archived) return false
  const paused = lifeMonth(life?.pausedAt ?? null)
  if (goal.status === 'paused' && paused && month >= paused) return false
  return true
}

// Per goal -------------------------------------------------------------------------------------------------------

export type GoalPlanState =
  /** The reserve reached the target. */
  | 'done'
  /** The target date passed and the target was not reached. */
  | 'overdue'
  /** No target date: nothing can be scheduled. */
  | 'no_date'
  | 'paused'
  /** Needs a monthly amount to arrive on time. */
  | 'planned'
  /** Little time left and a big part of the target still missing. */
  | 'attention'

export interface GoalPlan {
  goal: SavingsGoal
  state: GoalPlanState
  remainingCents: Cents
  /** Months from this one through the target month, inclusive; 0 without a usable date. */
  monthsLeft: number
  /** What the goal asks for this month (from what was missing on the first day of the month). */
  needNowCents: Cents
  /** What it asks for each following month until the target month (from what is missing now). */
  needNextCents: Cents
  targetMonth: IsoDate | null
}

/** Less than this many months left with this share of the target missing: the goal needs attention. */
export const ATTENTION_MONTHS = 2
export const ATTENTION_SHARE = 0.3

/** The monthly amount to put aside: what is missing, spread over the months left (rounded up to the cent). */
export function perMonth(remainingCents: Cents, monthsLeft: number): Cents {
  if (remainingCents <= 0 || monthsLeft <= 0) return 0
  return Math.ceil(remainingCents / monthsLeft)
}

export function goalPlan(goal: SavingsGoal, input: PlanInput): GoalPlan {
  const current = monthStart(input.today)
  const remainingNow = Math.max(0, goal.targetCents - goal.reservedCents)
  const base = {
    goal,
    remainingCents: remainingNow,
    monthsLeft: 0,
    needNowCents: 0,
    needNextCents: 0,
    targetMonth: goal.targetDate ? monthStart(goal.targetDate) : null,
  }
  if (remainingNow === 0) return { ...base, state: 'done' }
  if (goal.status === 'paused') return { ...base, state: 'paused' }
  if (!goal.targetDate || !base.targetMonth) return { ...base, state: 'no_date' }
  const monthsLeft = monthsBetween(current, base.targetMonth) + 1
  if (monthsLeft <= 0) return { ...base, state: 'overdue' }
  const remainingAtStart = Math.max(
    0,
    goal.targetCents - reservedAtStart(goal.id, current, input.data.months),
  )
  const needNow = perMonth(remainingAtStart, monthsLeft)
  const needNext = monthsLeft > 1 ? perMonth(remainingNow, monthsLeft) : 0
  const attention =
    monthsLeft <= ATTENTION_MONTHS && remainingNow > goal.targetCents * ATTENTION_SHARE
  return {
    ...base,
    state: attention ? 'attention' : 'planned',
    monthsLeft,
    needNowCents: needNow,
    needNextCents: needNext,
  }
}

// Per month ------------------------------------------------------------------------------------------------------

export interface MonthPoint {
  month: IsoDate
  kind: 'past' | 'current' | 'future'
  /** Net saved in the month (contributions minus withdrawals); null for months that have not happened. */
  savedCents: Cents | null
  /** What the plan asked for that month. */
  requiredCents: Cents
  /** Goals that existed by then (with or without a date). */
  goalsExisted: number
  /** Goals that asked for a monthly amount. */
  goalsPlanned: number
  /** There are movements in the month. */
  hasRecords: boolean
}

/** What one goal asked for in `month` (0 when it did not take part or had no date). */
function requiredOf(goal: SavingsGoal, input: PlanInput, month: IsoDate): Cents {
  const current = monthStart(input.today)
  const life = input.data.lives[goal.id]
  if (!inPlan(goal, life, month)) return 0
  if (!goal.targetDate) return 0
  const targetMonth = monthStart(goal.targetDate)
  if (month > targetMonth) return 0
  if (month > current) {
    // From today on: what is missing now, spread over the months left (this one included).
    const remainingNow = Math.max(0, goal.targetCents - goal.reservedCents)
    return perMonth(remainingNow, monthsBetween(current, targetMonth) + 1)
  }
  const remaining = Math.max(
    0,
    goal.targetCents - reservedAtStart(goal.id, month, input.data.months),
  )
  return perMonth(remaining, monthsBetween(month, targetMonth) + 1)
}

export function monthPoint(input: PlanInput, rawMonth: IsoDate): MonthPoint {
  const month = monthStart(rawMonth)
  const current = monthStart(input.today)
  const kind = month < current ? 'past' : month === current ? 'current' : 'future'
  const rows = input.data.months.filter((r) => r.month === month)
  let required = 0
  let existed = 0
  let planned = 0
  for (const goal of input.goals) {
    const created = startMonth(goal.id, input.data.lives[goal.id], input.data.months)
    if (created && month >= created) existed += 1
    // A goal that is not part of this month's plan (completed, archived or paused by then) asks for nothing.
    const asked = requiredOf(goal, input, month)
    if (asked > 0) {
      planned += 1
      required += asked
    }
  }
  return {
    month,
    kind,
    savedCents:
      kind === 'future' ? null : rows.reduce((s, r) => s + r.depositedCents - r.withdrawnCents, 0),
    requiredCents: required,
    goalsExisted: existed,
    goalsPlanned: planned,
    hasRecords: rows.length > 0,
  }
}

/** The tallest bar between two months (inclusive): one shared scale, so bars can be compared with each other. */
export function scaleMax(input: PlanInput, from: IsoDate, to: IsoDate): Cents {
  let max = 0
  for (let m = monthStart(from); m <= monthStart(to); m = shiftMonth(m, 1)) {
    const p = monthPoint(input, m)
    max = Math.max(max, p.requiredCents, p.savedCents ?? 0)
  }
  return max
}

export type MonthVerdict =
  | { kind: 'no_goals' }
  | { kind: 'no_plan'; savedCents: Cents }
  | { kind: 'future'; requiredCents: Cents }
  | { kind: 'met'; savedCents: Cents; requiredCents: Cents; extraCents: Cents }
  | { kind: 'short'; savedCents: Cents; requiredCents: Cents; missingCents: Cents; open: boolean }

/** What to say about a month: met the plan, fell short, nothing was planned, or it is still ahead. */
export function monthVerdict(point: MonthPoint): MonthVerdict {
  if (point.kind === 'future') return { kind: 'future', requiredCents: point.requiredCents }
  const saved = Math.max(0, point.savedCents ?? 0)
  if (point.goalsExisted === 0) return { kind: 'no_goals' }
  if (point.requiredCents === 0) return { kind: 'no_plan', savedCents: saved }
  if (saved >= point.requiredCents) {
    return {
      kind: 'met',
      savedCents: saved,
      requiredCents: point.requiredCents,
      extraCents: saved - point.requiredCents,
    }
  }
  return {
    kind: 'short',
    savedCents: saved,
    requiredCents: point.requiredCents,
    missingCents: point.requiredCents - saved,
    open: point.kind === 'current',
  }
}

// Now ------------------------------------------------------------------------------------------------------------

export interface PlanStep {
  from: IsoDate
  to: IsoDate
  perMonthCents: Cents
}

export type ProgressStatus =
  /** No active goals. */
  | 'empty'
  /** Every active goal reached its target. */
  | 'done'
  | 'attention'
  | 'behind'
  | 'on_track'
  /** Month just started and nothing is due yet or nothing has been saved: neither good nor bad news. */
  | 'pending'
  /** There are goals but none has a date, so there is no plan to measure. */
  | 'no_plan'

export interface PlanNow {
  currentMonth: IsoDate
  goals: GoalPlan[]
  requiredCents: Cents
  savedCents: Cents
  /** What is still missing this month to follow the plan. */
  missingCents: Cents
  steps: PlanStep[]
  status: ProgressStatus
  /** The goal that most needs attention, when there is one. */
  focus: GoalPlan | null
  /** What last month's plan lacked (0 when it was met or there was no plan). */
  lastMonthShortCents: Cents
}

/** From this day of the month on, a month that has not met its plan reads as "behind", not just "still to do". */
export const LATE_IN_MONTH_DAY = 21

export function planNow(input: PlanInput): PlanNow {
  const current = monthStart(input.today)
  const active = input.goals.filter((g) => g.status === 'active')
  const plans = active.map((g) => goalPlan(g, input))
  const open = plans.filter((p) => p.state !== 'done')
  const planned = open.filter((p) => p.state === 'planned' || p.state === 'attention')
  const required = planned.reduce((s, p) => s + p.needNowCents, 0)
  const saved = Math.max(0, monthPoint(input, current).savedCents ?? 0)
  const missing = Math.max(0, required - saved)

  // Steps: the amount asked each month until the last target month, grouped while it stays the same.
  const lastTarget = planned.reduce<IsoDate | null>(
    (max, p) => (p.targetMonth && (!max || p.targetMonth > max) ? p.targetMonth : max),
    null,
  )
  const steps: PlanStep[] = []
  if (lastTarget) {
    for (let m = current; m <= lastTarget; m = shiftMonth(m, 1)) {
      const amount = m === current ? required : monthPoint(input, m).requiredCents
      const last = steps[steps.length - 1]
      if (last && last.perMonthCents === amount) last.to = m
      else steps.push({ from: m, to: m, perMonthCents: amount })
    }
  }

  const prev = monthPoint(input, shiftMonth(current, -1))
  const lastMonthShort =
    prev.requiredCents > 0 ? Math.max(0, prev.requiredCents - Math.max(0, prev.savedCents ?? 0)) : 0
  const focus = plans.find((p) => p.state === 'attention') ?? null
  const day = Number(input.today.slice(8, 10))

  let status: ProgressStatus
  if (active.length === 0) status = 'empty'
  else if (open.length === 0) status = 'done'
  else if (focus) status = 'attention'
  else if (planned.length === 0) status = 'no_plan'
  else if (saved >= required) status = 'on_track'
  else if (lastMonthShort > 0) status = 'behind'
  else if (day >= LATE_IN_MONTH_DAY) status = 'behind'
  else status = 'pending'

  return {
    currentMonth: current,
    goals: plans,
    requiredCents: required,
    savedCents: saved,
    missingCents: missing,
    steps,
    status,
    focus,
    lastMonthShortCents: lastMonthShort,
  }
}

export const STATUS_LABELS: Record<ProgressStatus, string> = {
  empty: 'Sin metas activas',
  done: 'Meta cumplida',
  attention: 'Tu meta necesita atención',
  behind: 'Necesitás ahorrar un poco más',
  on_track: 'Vas al día',
  pending: 'Todavía estás a tiempo',
  no_plan: 'Sin fechas objetivo',
}

// Recommendation -------------------------------------------------------------------------------------------------

export interface Recommendation {
  kind:
    | 'done'
    | 'attention'
    | 'month_met'
    | 'month_short'
    | 'last_month_short'
    | 'rate'
    | 'no_date'
    | 'overdue'
    | 'paused'
    | 'empty'
  text: string
  /** The goal the advice is about, so the card can link to it. */
  goalId: string | null
}

const dateLabel = (month: IsoDate | null) => (month ? formatMonthShortYear(month) : '')
const monthWord = (month: IsoDate) => `${monthNameOf(month)} de ${month.slice(0, 4)}`

/**
 * One short, rule-based piece of advice. Every sentence comes from the real numbers: no random phrases, and it never
 * claims the person can afford an amount (Moni does not know their income).
 */
export function recommend(now: PlanNow): Recommendation {
  if (now.status === 'empty')
    return {
      kind: 'empty',
      text: 'Creá una meta y Moni te dice cuánto reservar por mes.',
      goalId: null,
    }
  const byNeed = [...now.goals]
    .filter((p) => p.state === 'planned' || p.state === 'attention')
    .sort((a, b) => b.needNowCents - a.needNowCents)
  if (now.status === 'done')
    return {
      kind: 'done',
      text: '¡Cumpliste todas tus metas activas! Podés crear una nueva.',
      goalId: null,
    }
  if (now.focus) {
    const p = now.focus
    const left = p.monthsLeft === 1 ? 'queda este mes' : `quedan ${p.monthsLeft} meses`
    return {
      kind: 'attention',
      text: `Tu meta ${p.goal.name} necesita atención: ${left} y faltan ${formatArs(p.remainingCents)}. Para llegar necesitás reservar ${formatArs(p.needNowCents)}${p.monthsLeft > 1 ? ' por mes' : ''}.`,
      goalId: p.goal.id,
    }
  }
  if (now.status === 'on_track' && now.requiredCents > 0)
    return {
      kind: 'month_met',
      text: '¡Cumpliste tu objetivo de ahorro de este mes!',
      goalId: null,
    }
  if (now.status === 'behind' && now.requiredCents > 0) {
    // Nothing saved yet this month, after a month that fell short: say so before asking for more.
    const carried = now.savedCents === 0 && now.lastMonthShortCents > 0
    return {
      kind: carried ? 'last_month_short' : 'month_short',
      text: carried
        ? `El mes pasado ahorraste ${formatArs(now.lastMonthShortCents)} menos de lo planificado. Este mes necesitás reservar ${formatArs(now.requiredCents)}.`
        : `Este mes ahorraste ${formatArs(now.missingCents)} menos de lo planificado.`,
      goalId: byNeed[0]?.goal.id ?? null,
    }
  }
  const top = byNeed[0]
  if (top && top.targetMonth) {
    return {
      kind: 'rate',
      text: `Para llegar a tu meta ${top.goal.name} en ${monthWord(top.targetMonth)}, necesitás reservar ${formatArs(top.needNowCents)}${top.monthsLeft > 1 ? ' por mes' : ' este mes'}.`,
      goalId: top.goal.id,
    }
  }
  const overdue = now.goals.find((p) => p.state === 'overdue')
  if (overdue && overdue.goal.targetDate) {
    return {
      kind: 'overdue',
      text: `Tu meta ${overdue.goal.name} venció en ${dateLabel(overdue.targetMonth)} y faltan ${formatArs(overdue.remainingCents)}. Podés cambiar la fecha.`,
      goalId: overdue.goal.id,
    }
  }
  const noDate = now.goals.find((p) => p.state === 'no_date')
  if (noDate) {
    const pct = Math.min(
      100,
      Math.floor((noDate.goal.reservedCents / noDate.goal.targetCents) * 100),
    )
    return {
      kind: 'no_date',
      text: `Tu meta ${noDate.goal.name} está al ${pct}%. Ponele una fecha para saber cuánto reservar por mes.`,
      goalId: noDate.goal.id,
    }
  }
  return {
    kind: 'paused',
    text: 'Tus metas están en pausa. Reactivá una para retomar el plan.',
    goalId: null,
  }
}

// Simulator ------------------------------------------------------------------------------------------------------

export interface Simulation {
  /** Contributions needed at that monthly amount. */
  months: number
  /** Month the goal would be reached (the first contribution is this month). */
  reachedMonth: IsoDate
  /** Against the target date; null when the goal has none. */
  onTime: boolean | null
  /** How many months after the target month it would be reached (0 when on time or without date). */
  monthsLate: number
}

/** When would the goal be reached saving `monthlyCents` every month, starting this month? Never changes the goal. */
export function simulate(
  goal: SavingsGoal,
  monthlyCents: Cents,
  today: IsoDate,
): Simulation | null {
  const remaining = Math.max(0, goal.targetCents - goal.reservedCents)
  if (monthlyCents <= 0) return null
  const current = monthStart(today)
  const months = remaining === 0 ? 0 : Math.ceil(remaining / monthlyCents)
  const reachedMonth = shiftMonth(current, Math.max(0, months - 1))
  if (!goal.targetDate) return { months, reachedMonth, onTime: null, monthsLate: 0 }
  const late = monthsBetween(monthStart(goal.targetDate), reachedMonth)
  return { months, reachedMonth, onTime: late <= 0, monthsLate: Math.max(0, late) }
}

/** The usual contribution: the average net saved in this goal in the last three closed months with records. */
export function averageSaved(goalId: string, today: IsoDate, rows: readonly MonthlyRow[]): Cents {
  const current = monthStart(today)
  const months = [1, 2, 3].map((d) => shiftMonth(current, -d))
  const values = months
    .map((m) => rows.filter((r) => r.goalId === goalId && r.month === m))
    .filter((r) => r.length > 0)
    .map((r) => r.reduce((s, x) => s + x.depositedCents - x.withdrawnCents, 0))
  if (values.length === 0) return 0
  return Math.max(0, Math.round(values.reduce((a, b) => a + b, 0) / values.length))
}
