import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { dayInMonth, dueFor, statementClosingFor } from './cardCalendar'
import type { Statement } from './overview'

/** Share of the monthly income that the card statement should not go past (a rule of thumb, shown as "techo"). */
export const CARD_CEILING_SHARE = 0.2
export const STATEMENT_BARS = 6

/** The ceiling in cents: 20% of the expected monthly income; null without income (no ceiling is drawn). */
export function cardCeilingCents(expectedIncomeCents: Cents | null): Cents | null {
  if (expectedIncomeCents === null || expectedIncomeCents <= 0) return null
  return Math.round(expectedIncomeCents * CARD_CEILING_SHARE)
}

/** The statement the person pays next: the earliest closed-or-open one that still has something to pay. */
export function nextStatement(statements: readonly Statement[]): Statement | null {
  return (
    statements
      .filter((s) => s.closingOn !== null && (s.status === 'billed' || s.status === 'open'))
      .filter((s) => s.remainingCents > 0)
      .sort((a, b) => (a.closingOn ?? '').localeCompare(b.closingOn ?? ''))[0] ?? null
  )
}

export interface StatementBar {
  closingOn: IsoDate
  dueOn: IsoDate | null
  totalCents: Cents
  installmentsCents: Cents
  /** Everything else on the statement: purchases and fixed charges. */
  otherCents: Cents
}

/**
 * Up to six statements starting at the next one, each split into installments and the rest. `installmentsByClosing`
 * holds the installments of every statement (from its movements); missing data counts as no installments.
 */
export function buildStatementBars(
  statements: readonly Statement[],
  installmentsByClosing: ReadonlyMap<IsoDate, Cents>,
): StatementBar[] {
  const next = nextStatement(statements)
  if (!next?.closingOn) return []
  const from = next.closingOn
  return statements
    .filter((s): s is Statement & { closingOn: IsoDate } => s.closingOn !== null && s.closingOn >= from)
    .sort((a, b) => a.closingOn.localeCompare(b.closingOn))
    .slice(0, STATEMENT_BARS)
    .map((s) => {
      const total = Math.max(0, s.chargedCents - s.paidCents)
      const installments = Math.min(total, installmentsByClosing.get(s.closingOn) ?? 0)
      return {
        closingOn: s.closingOn,
        dueOn: s.dueOn,
        totalCents: total,
        installmentsCents: installments,
        otherCents: total - installments,
      }
    })
}

export interface PurchaseTip {
  /** Closing day of the card: purchases after it fall in the following statement. */
  day: number
  /** Month (any ISO date inside it) in which that following statement is due. */
  dueOn: IsoDate
}

/**
 * "Si comprás después del día N, entra en el resumen de <mes>": the statement after the next closing, named by the
 * month it is due. Null when the card has no closing day.
 */
export function purchaseTip(
  closingDay: number | null,
  dueDay: number | null,
  today: IsoDate,
): PurchaseTip | null {
  if (closingDay === null) return null
  const nextClosing = statementClosingFor(today, closingDay)
  const following = dayInMonth(nextClosing, closingDay, 1)
  const dueOn = dueDay === null ? following : dueFor(following, dueDay)
  return { day: closingDay, dueOn }
}
