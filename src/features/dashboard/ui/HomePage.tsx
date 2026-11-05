import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { initialOf } from '@/features/auth/domain/profile'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import {
  useSavings,
  useSavingsNoticeCount,
  useSavingsPlanData,
} from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { planNow } from '@/features/goals/domain/savingsPlan'
import { useUnreadNoticeCount } from '@/features/debts/api/useDebts'
import { usePlus } from '@/features/plus/api/usePlus'
import { useRecurringReminders } from '@/features/recurring/api/useRecurringReminders'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useCategories } from '@/features/categories/api/useCategories'
import { indexCategories } from '@/features/categories/domain/category'
import { useVoidInstallmentPlan } from '@/features/cards/api/useCards'
import {
  useTransactions,
  useTransfers,
  useVoidTransaction,
} from '@/features/transactions/api/useTransactions'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { toUserMessage } from '@/shared/lib/errors'
import { useToast } from '@/shared/ui/toastContext'
import { monthStart, todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useMonthSummary } from '../api/useMonthSummary'
import { buildBalanceSeries } from '../domain/balanceSeries'
import { buildRecentMovements } from '../domain/recentMovements'
import { useHomeStories } from '../api/useHomeStories'
import type { RecentMovement } from '../domain/monthSummary'
import type { MovementActions } from './RecentMovements'
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

/** The most rows Supabase returns in one request. */
const ROW_CAP = 1000
const EMPTY_SUMMARY = {
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: 0,
  byCategory: [],
  daily: [],
  recent: [],
}
/** How many of the newest movements the main screen lists, across every month. */
const RECENT_LIMIT = 20

export function HomePage() {
  const latestMonth = monthStart(todayIso())
  const [month, setMonth] = useState(latestMonth)
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const summary = useMonthSummary(month)
  const transactions = useTransactions()
  const categories = useCategories(undefined, { includeArchived: true })
  const accounts = useAccounts({ includeArchived: true })
  const transfers = useTransfers()
  const { openNew, openEdit } = useMovementSheet()
  const toast = useToast()
  const voidTransaction = useVoidTransaction()
  const voidPlan = useVoidInstallmentPlan()
  const planData = useSavingsPlanData()
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
  // The chart is rebuilt from the real movements; until they all load it stays empty rather than guessing.
  const balanceSeries = useMemo(
    () =>
      summary.data && transactions.data && transfers.data && accounts.data
        ? buildBalanceSeries({
            currentCents: summary.data.availableBalanceCents,
            accounts: accounts.data,
            transactions: transactions.data,
            transfers: transfers.data,
            today: todayIso(),
            // Supabase returns at most 1000 rows per request: a full page may be cut short.
            truncated: {
              transactions: transactions.data.length >= ROW_CAP,
              transfers: transfers.data.length >= ROW_CAP,
            },
          })
        : null,
    [summary.data, transactions.data, transfers.data, accounts.data],
  )
  const goalTotals = activeTotals(savings.data?.goals ?? [])
  const plan = useMemo(
    () =>
      savings.data && planData.data
        ? planNow({ today: savings.data.today, goals: savings.data.goals, data: planData.data })
        : null,
    [savings.data, planData.data],
  )
  const stories = useHomeStories(month, summary.data ?? EMPTY_SUMMARY, latestMonth)

  // What the swipe on a row can do comes from the real transaction, with the same rules as Actividad.
  const movementActions = useMemo<MovementActions>(() => {
    const byId = new Map((transactions.data ?? []).map((t) => [t.id, t]))
    const find = (m: RecentMovement) => byId.get(m.id)
    return {
      canEdit: (m) => {
        const t = find(m)
        return Boolean(t && (t.kind === 'expense' || t.kind === 'income') && !t.installmentPlanId)
      },
      canVoid: (m) => Boolean(find(m)) && m.kind !== 'opening_in',
      isInstallment: (m) => Boolean(find(m)?.installmentPlanId),
      onEdit: (m) => {
        const t = find(m)
        if (t) openEdit(t)
      },
      onVoid: async (m) => {
        const t = find(m)
        try {
          if (t?.installmentPlanId) await voidPlan.mutateAsync(t.installmentPlanId)
          else await voidTransaction.mutateAsync(m.id)
        } catch (e) {
          throw new Error(toUserMessage(e))
        }
        toast.show(t?.installmentPlanId ? 'Compra en cuotas anulada' : 'Movimiento anulado')
      },
    }
  }, [transactions.data, openEdit, voidPlan, voidTransaction, toast])

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
      // While the full history loads, the month's own latest movements stand in.
      movements={transactions.data ? movements : undefined}
      month={month}
      latestMonth={latestMonth}
      onMonthChange={setMonth}
      initial={initialOf(profile?.display_name, user?.email ?? '')}
      isPlus={plus.isPlus}
      photoUrl={resolveAvatarUrl({ user, profileUrl: profile?.avatar_url })}
      userId={user?.id}
      name={profile?.display_name?.trim().split(/\s+/)[0] || null}
      balanceSeries={balanceSeries}
      onAddMovement={() => openNew()}
      shortcuts={{ ants: features.has('ants') }}
      reminderCount={reminders.length + savingsNotices}
      noticeCount={noticeCount}
      goals={{
        reservedCents: goalTotals.reservedCents,
        targetCents: goalTotals.targetCents,
        count: goalTotals.count,
        missingCents: plan ? plan.missingCents : null,
        requiredCents: plan ? plan.requiredCents : null,
      }}
      stories={stories}
      movementActions={movementActions}
      movementsTotal={transactions.data?.length}
    />
  )
}
