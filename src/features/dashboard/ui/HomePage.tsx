import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { initialOf } from '@/features/auth/domain/profile'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import { useSavings, useSavingsNoticeCount } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { SavingsNotices } from '@/features/goals/ui/SavingsNotices'
import { useUnreadNoticeCount } from '@/features/debts/api/useDebts'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusBadge } from '@/features/plus/ui/PlusBadge'
import { useRecurringReminders } from '@/features/recurring/api/useRecurringReminders'
import { RecurringReminders } from '@/features/recurring/ui/RecurringReminders'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useCategories } from '@/features/categories/api/useCategories'
import { indexCategories } from '@/features/categories/domain/category'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { addDays, monthStart, todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useMonthSummary, usePeriodSummary } from '../api/useMonthSummary'
import { buildRecentMovements } from '../domain/recentMovements'
import { HomeScreen } from './HomeScreen'

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Cargando resumen" className="flex flex-col gap-4">
      <Skeleton className="h-64 rounded-b-[40px] rounded-t-none" />
      <div className="flex flex-col gap-4 px-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}

/** The database caps a period summary at 400 days: the widest window the header can total in one call. */
const OVERALL_DAYS = 400
/** How many of the newest movements the main screen lists, across every month. */
const RECENT_LIMIT = 20

export function HomePage() {
  const latestMonth = monthStart(todayIso())
  const tomorrow = addDays(todayIso(), 1)
  const [month, setMonth] = useState(latestMonth)
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const summary = useMonthSummary(month)
  // Income and expenses in the header do not follow the month picker: an empty new month must not read as $0.
  const overall = usePeriodSummary(addDays(tomorrow, -OVERALL_DAYS), tomorrow)
  const transactions = useTransactions()
  const categories = useCategories(undefined, { includeArchived: true })
  const accounts = useAccounts({ includeArchived: true })
  const { openNew } = useMovementSheet()
  const features = useEnabledFeatures()
  const reminders = useRecurringReminders()
  const savings = useSavings()
  const savingsNotices = useSavingsNoticeCount()
  const noticeCount = useUnreadNoticeCount()
  const plus = usePlus()
  const movements = useMemo(
    () =>
      buildRecentMovements({
        transactions: transactions.data ?? [],
        categoriesById: indexCategories(categories.data ?? []),
        accountNamesById: new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
        today: todayIso(),
        limit: RECENT_LIMIT,
      }),
    [transactions.data, categories.data, accounts.data],
  )
  const goalTotals = activeTotals(savings.data?.goals ?? [])

  if (summary.isLoading) return <HomeSkeleton />
  if (summary.isError || !summary.data) {
    return (
      <EmptyState
        className="pt-24"
        mascotUrl={mascotAlert}
        title="No pudimos cargar tu resumen"
        description="Revisá tu conexión y probá de nuevo."
        action={<Button onClick={() => void summary.refetch()}>Reintentar</Button>}
      />
    )
  }

  return (
    <HomeScreen
      summary={summary.data}
      overall={overall.data}
      // While the full history loads, the month's own latest movements stand in.
      movements={transactions.data ? movements : undefined}
      month={month}
      latestMonth={latestMonth}
      onMonthChange={setMonth}
      initial={initialOf(profile?.display_name, user?.email ?? '')}
      isPlus={plus.isPlus}
      photoUrl={resolveAvatarUrl({ user, profileUrl: profile?.avatar_url })}
      onAddMovement={() => openNew()}
      shortcuts={{ ants: features.has('ants') }}
      reminders={
        <>
          <PlusBadge />
          <SavingsNotices />
          <RecurringReminders />
        </>
      }
      reminderCount={reminders.length + savingsNotices}
      noticeCount={noticeCount}
      goals={{
        reservedCents: goalTotals.reservedCents,
        targetCents: goalTotals.targetCents,
        count: goalTotals.count,
      }}
    />
  )
}
