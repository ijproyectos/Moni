import { useQueries } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { buildStatementBars, type StatementBar } from '../domain/statementChart'
import type { Statement } from '../domain/overview'
import { cardKeys } from './queryKeys'
import { listStatementItems } from './cardsRepository'

/**
 * The statements ahead (up to six) of a card, each split into installments and everything else. It reads the movements
 * of each statement (the same query the statement detail uses), so what is drawn is what the statement holds.
 */
export function useStatementBars(accountId: string, statements: readonly Statement[]) {
  const { user } = useAuth()
  const closings = buildStatementBars(statements, new Map()).map((b) => b.closingOn)
  const queries = useQueries({
    queries: closings.map((closingOn) => ({
      queryKey: cardKeys.statementItems(user?.id, accountId, closingOn),
      enabled: Boolean(user),
      queryFn: () => listStatementItems(accountId, closingOn),
    })),
  })
  const installments = new Map<IsoDate, Cents>()
  queries.forEach((q, i) => {
    const closing = closings[i]
    if (!closing || !q.data) return
    installments.set(
      closing,
      q.data
        .filter((t) => t.kind === 'expense' && t.installmentNumber !== null)
        .reduce((sum, t) => sum + t.amountCents, 0),
    )
  })
  const bars: StatementBar[] = buildStatementBars(statements, installments)
  return { bars, isLoading: queries.some((q) => q.isLoading) }
}
