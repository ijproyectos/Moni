import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import { useSavings, useSavingsNoticeCount } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { SavingsNotices } from '@/features/goals/ui/SavingsNotices'
import { useRecurringReminders } from '@/features/recurring/api/useRecurringReminders'
import { RecurringReminders } from '@/features/recurring/ui/RecurringReminders'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { monthStart, todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useMonthSummary } from '../api/useMonthSummary'
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

export function HomePage() {
  const latestMonth = monthStart(todayIso())
  const [month, setMonth] = useState(latestMonth)
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const summary = useMonthSummary(month)
  const { openNew } = useMovementSheet()
  const features = useEnabledFeatures()
  const reminders = useRecurringReminders()
  const savings = useSavings()
  const savingsNotices = useSavingsNoticeCount()
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
      month={month}
      latestMonth={latestMonth}
      onMonthChange={setMonth}
      initial={initialOf(profile?.display_name, user?.email ?? '')}
      onAddMovement={() => openNew()}
      shortcuts={{ savings: features.has('savings'), ants: features.has('ants') }}
      reminders={
        <>
          <SavingsNotices />
          <RecurringReminders />
        </>
      }
      reminderCount={reminders.length + savingsNotices}
      goals={{ reservedCents: goalTotals.reservedCents, targetCents: goalTotals.targetCents }}
    />
  )
}
