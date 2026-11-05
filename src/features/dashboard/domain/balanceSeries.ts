import { isCreditCard, type Account } from '@/features/accounts/domain/account'
import {
  addsToBalance,
  type Transaction,
  type Transfer,
} from '@/features/transactions/domain/transaction'
import type { Cents } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'

export interface BalancePoint {
  date: IsoDate
  /** Available money at the end of that day. */
  cents: Cents
}

interface BalanceSeriesInput {
  /** Today's "Dinero disponible", exactly as the summary reports it. */
  currentCents: Cents
  accounts: readonly Pick<Account, 'id' | 'kind' | 'currency' | 'archivedAt'>[]
  transactions: readonly Pick<
    Transaction,
    'accountId' | 'kind' | 'amountCents' | 'occurredOn' | 'status'
  >[]
  transfers: readonly Pick<
    Transfer,
    'fromAccountId' | 'toAccountId' | 'amountCents' | 'occurredOn' | 'status'
  >[]
  today: IsoDate
  /** How many days the line covers, today included. */
  days?: number
  /** Which lists may have been cut short by the server's row cap. */
  truncated?: { transactions?: boolean; transfers?: boolean }
}

/** Fewer days with movements than this and the line would say nothing: the card shows an empty state instead. */
const MIN_ACTIVE_DAYS = 2

/**
 * Daily available balance for the last `days` days, rebuilt from the real movements by undoing, from today's balance
 * backwards, everything dated after each day. "Available" means the same as in the summary (active, ARS, not a card),
 * so the last point always equals `currentCents`. Returns `null` when the history is too thin to draw an honest line.
 */
export function buildBalanceSeries({
  currentCents,
  accounts,
  transactions,
  transfers,
  today,
  days = 30,
  truncated = {},
}: BalanceSeriesInput): BalancePoint[] | null {
  const available = new Set(
    accounts
      .filter((a) => a.archivedAt === null && a.currency === 'ARS' && !isCreditCard(a))
      .map((a) => a.id),
  )
  // Signed effect of each posted movement on the available money, keyed by its day.
  const effects: { on: IsoDate; cents: Cents }[] = []
  for (const t of transactions) {
    if (t.status !== 'posted' || !available.has(t.accountId)) continue
    effects.push({
      on: t.occurredOn,
      cents: addsToBalance(t.kind) ? t.amountCents : -t.amountCents,
    })
  }
  for (const t of transfers) {
    if (t.status !== 'posted') continue
    const delta =
      (available.has(t.toAccountId) ? t.amountCents : 0) -
      (available.has(t.fromAccountId) ? t.amountCents : 0)
    if (delta !== 0) effects.push({ on: t.occurredOn, cents: delta })
  }

  const first = addDays(today, -(days - 1))
  // A cut-short list (newest first) is only complete back to its oldest row: if that day is inside the window, the
  // line would lie, so it is not drawn.
  const oldest = (rows: readonly { occurredOn: IsoDate }[]) =>
    rows.reduce<IsoDate | null>(
      (min, r) => (min === null || r.occurredOn < min ? r.occurredOn : min),
      null,
    )
  const unreliable = (rows: readonly { occurredOn: IsoDate }[], cut: boolean | undefined) => {
    const from = oldest(rows)
    return cut && from !== null && from >= first
  }
  if (
    unreliable(transactions, truncated.transactions) ||
    unreliable(transfers, truncated.transfers)
  )
    return null
  const activeDays = new Set(effects.filter((e) => e.on >= first && e.on <= today).map((e) => e.on))
  if (activeDays.size < MIN_ACTIVE_DAYS) return null

  const points: BalancePoint[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(first, i)
    const after = effects.reduce((sum, e) => (e.on > date ? sum + e.cents : sum), 0)
    points.push({ date, cents: currentCents - after })
  }
  return points
}
