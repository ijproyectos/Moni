import { z } from 'zod'
import { toCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

// Shape returned by public.get_card_overview. Amounts arrive as JSON numbers and become cents here.
const cents = z.number().transform((value) => toCents(value))
const nullableCents = z
  .number()
  .nullable()
  .transform((value) => (value === null ? null : toCents(value)))

const rawOverviewSchema = z.object({
  account_id: z.string(),
  configured: z.boolean(),
  credit_limit: nullableCents,
  closing_day: z.number().nullable(),
  due_day: z.number().nullable(),
  billed: cents,
  open: cents,
  future: cents,
  debt_total: cents,
  in_favor: cents,
  available: nullableCents,
  next_closing_on: z.string().nullable(),
  next_due_on: z.string().nullable(),
  statements: z.array(
    z.object({
      closing_on: z.string().nullable(),
      due_on: z.string().nullable(),
      charged: cents,
      paid: cents,
      remaining: cents,
      phase: z.enum(['closed', 'open', 'future']),
      status: z.enum(['paid', 'billed', 'open', 'future']),
    }),
  ),
})

/** Where a statement stands: paid, billed (closed and unpaid), the one in progress, or still to come. */
export type StatementStatus = 'paid' | 'billed' | 'open' | 'future'

export interface Statement {
  /** Null for the debt that came before Moni (opening debt). */
  closingOn: IsoDate | null
  dueOn: IsoDate | null
  chargedCents: Cents
  paidCents: Cents
  remainingCents: Cents
  status: StatementStatus
}

export interface CardOverview {
  accountId: string
  configured: boolean
  creditLimitCents: Cents | null
  closingDay: number | null
  dueDay: number | null
  /** Closed statements still unpaid ("deuda facturada"). */
  billedCents: Cents
  /** The statement in progress ("por facturar"). */
  openCents: Cents
  /** Statements after it: installments still to come ("cuotas futuras"). */
  futureCents: Cents
  /** billed + open + future: what is owed, installments included. */
  debtTotalCents: Cents
  /** Credit beyond the whole debt. */
  inFavorCents: Cents
  /** Limit minus total debt; null without a limit, negative when over it. */
  availableCents: Cents | null
  nextClosingOn: IsoDate | null
  nextDueOn: IsoDate | null
  statements: Statement[]
}

export function parseCardOverview(payload: unknown): CardOverview | null {
  if (payload === null || payload === undefined) return null
  const raw = rawOverviewSchema.parse(payload)
  return {
    accountId: raw.account_id,
    configured: raw.configured,
    creditLimitCents: raw.credit_limit,
    closingDay: raw.closing_day,
    dueDay: raw.due_day,
    billedCents: raw.billed,
    openCents: raw.open,
    futureCents: raw.future,
    debtTotalCents: raw.debt_total,
    inFavorCents: raw.in_favor,
    availableCents: raw.available,
    nextClosingOn: raw.next_closing_on,
    nextDueOn: raw.next_due_on,
    statements: raw.statements.map((s) => ({
      closingOn: s.closing_on,
      dueOn: s.due_on,
      chargedCents: s.charged,
      paidCents: s.paid,
      remainingCents: s.remaining,
      status: s.status,
    })),
  }
}
