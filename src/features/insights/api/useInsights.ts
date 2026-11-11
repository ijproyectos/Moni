import { useMemo, useState } from 'react'
import { useMonthSummaries } from '@/features/dashboard/api/useMonthSummary'
import { lastMonths } from '@/features/dashboard/domain/stats'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { monthStart, todayIso } from '@/shared/lib/month'
import {
  antInsight,
  dismissInsight,
  loadDismissed,
  subscriptionInsights,
  unusualInsights,
  visibleInsights,
  type Insight,
} from '../domain/insights'
import { useAnts } from './useAnts'

export interface InsightsView {
  isLoading: boolean
  isError: boolean
  insights: Insight[]
  dismiss: (key: string) => void
}

/** Thin glue: gathers ants, subscription charges and category history, and hands them to the pure domain. */
export function useInsights(): InsightsView {
  const month = monthStart(todayIso())
  const ants = useAnts(month)
  const subscriptions = useSubscriptions()
  // This month plus the three before it, for the "unusual" comparison.
  const months = useMemo(() => lastMonths(month, 4), [month])
  const summaries = useMonthSummaries(months)
  const [dismissed, setDismissed] = useState(() => loadDismissed())

  const isLoading = ants.isLoading || subscriptions.isLoading || summaries.some((q) => q.isLoading)
  const isError = ants.isError && subscriptions.isError && summaries.every((q) => q.isError)

  const all = useMemo(() => {
    const out: Insight[] = []
    const ant = antInsight(ants.data)
    if (ant) out.push(ant)
    if (subscriptions.data) {
      out.push(...subscriptionInsights(subscriptions.data.subscriptions, subscriptions.data.charges))
    }
    const current = summaries[3]?.data
    if (current) {
      const previous = summaries.slice(0, 3).flatMap((q) => (q.data ? [q.data.byCategory] : []))
      out.push(...unusualInsights(current.byCategory, previous, month))
    }
    return out
  }, [ants.data, subscriptions.data, summaries, month])

  return {
    isLoading,
    isError,
    insights: visibleInsights(all, dismissed),
    dismiss: (key) => setDismissed(dismissInsight(key)),
  }
}
