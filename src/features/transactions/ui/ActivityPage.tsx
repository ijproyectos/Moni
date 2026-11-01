import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useVoidInstallmentPlan } from '@/features/cards/api/useCards'
import { useCategories } from '@/features/categories/api/useCategories'
import { indexCategories } from '@/features/categories/domain/category'
import { toUserMessage } from '@/shared/lib/errors'
import { monthRange, monthStart, shiftMonth, todayIso, type IsoDate } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useTransactions,
  useTransfers,
  useVoidTransaction,
  useVoidTransfer,
} from '../api/useTransactions'
import { buildActivity, groupByCategory, type ActivityEntry } from '../domain/activity'
import type { ActivityPeriod } from '../domain/activityPeriod'
import { loadActivityView, saveActivityView, type ActivityView } from '../domain/activityView'
import type { EntryKind } from '../domain/transaction'
import { calendarDayTotals, totalsOf } from '../domain/transactionQueries'
import { ActivityScreen } from './ActivityScreen'
import { useMovementSheet } from './movementSheetContext'

/** Open-ended on a `null` bound: no month filter keeps every date. */
function inRange(date: IsoDate, from: IsoDate | null, to: IsoDate | null): boolean {
  return (from === null || date >= from) && (to === null || date <= to)
}

/**
 * Container for Actividad: fetches every movement, owns the filters, delegates rendering. Nothing is hidden by
 * default: the month is just one more filter ("Por mes"), so a new month never makes the history look empty.
 */
export function ActivityPage() {
  const latestMonth = monthStart(todayIso())
  const [month, setMonth] = useState<IsoDate>(latestMonth)
  const [period, setPeriod] = useState<ActivityPeriod>('all')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | EntryKind>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<IsoDate | null>(null)
  const [view, setView] = useState<ActivityView>(loadActivityView)

  const transactions = useTransactions()
  const transfers = useTransfers()
  const categories = useCategories(undefined, { includeArchived: true })
  const accounts = useAccounts({ includeArchived: true })
  const voidTransaction = useVoidTransaction()
  const voidTransfer = useVoidTransfer()
  const voidPlan = useVoidInstallmentPlan()
  const toast = useToast()
  const { openEdit } = useMovementSheet()

  const categoriesById = useMemo(() => indexCategories(categories.data ?? []), [categories.data])
  const accountNamesById = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  )
  // The calendar always shows one month; the summary and the list only narrow to it with the "Por mes" filter.
  const monthScoped = view === 'calendar' || period === 'month'
  const listFrom = period === 'month' ? monthRange(month).from : null
  const listTo = period === 'month' ? monthRange(month).to : null
  const listTransactions = useMemo(
    () => (transactions.data ?? []).filter((tx) => inRange(tx.occurredOn, listFrom, listTo)),
    [transactions.data, listFrom, listTo],
  )
  const listTransfers = useMemo(
    () => (transfers.data ?? []).filter((tr) => inRange(tr.occurredOn, listFrom, listTo)),
    [transfers.data, listFrom, listTo],
  )
  const days = useMemo(
    () =>
      buildActivity({
        transactions: listTransactions,
        transfers: listTransfers,
        // The day filter belongs to the calendar; it is kept (not applied) while in list view.
        filters: { search, kind, categoryId, day: view === 'calendar' ? selectedDay : null },
        categoriesById,
        accountNamesById,
      }),
    [
      listTransactions,
      listTransfers,
      search,
      kind,
      categoryId,
      selectedDay,
      view,
      categoriesById,
      accountNamesById,
    ],
  )
  const groups = useMemo(() => groupByCategory(days, categoriesById), [days, categoriesById])
  const calendarDays = useMemo(
    () => calendarDayTotals(transactions.data ?? [], month),
    [transactions.data, month],
  )
  const totals = useMemo(() => {
    const summarized = (transactions.data ?? []).filter((tx) =>
      monthScoped ? tx.occurredOn.startsWith(month.slice(0, 7)) : true,
    )
    return totalsOf(summarized)
  }, [transactions.data, monthScoped, month])

  function changeView(next: ActivityView) {
    setView(next)
    saveActivityView(next)
  }

  function changeMonth(delta: number) {
    setMonth((m) => shiftMonth(m, delta))
    setSelectedDay(null)
  }

  async function handleVoid(entry: ActivityEntry) {
    try {
      if (entry.type === 'transaction') {
        // An installment is never voided alone: the whole purchase goes, so the plan stays consistent.
        if (entry.transaction.installmentPlanId) {
          await voidPlan.mutateAsync(entry.transaction.installmentPlanId)
        } else await voidTransaction.mutateAsync(entry.id)
      } else await voidTransfer.mutateAsync(entry.id)
    } catch (e) {
      throw new Error(toUserMessage(e))
    }
    toast.show(
      entry.type === 'transfer'
        ? 'Transferencia anulada'
        : entry.transaction.installmentPlanId
          ? 'Compra en cuotas anulada'
          : 'Movimiento anulado',
    )
  }

  if (transactions.isLoading || transfers.isLoading) {
    return (
      <div role="status" aria-label="Cargando actividad" className="flex flex-col gap-4 px-4 pt-12">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-14 rounded-full" />
        <Skeleton className="h-96" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (transactions.isError || transfers.isError) {
    return (
      <EmptyState
        className="pt-24"
        mascotUrl={mascotAlert}
        title="No pudimos cargar tu actividad"
        description="Revisá tu conexión y probá de nuevo."
        action={
          <Button
            onClick={() => {
              void transactions.refetch()
              void transfers.refetch()
            }}
          >
            Reintentar
          </Button>
        }
      />
    )
  }

  return (
    <ActivityScreen
      month={month}
      monthScoped={monthScoped}
      period={period}
      onPeriodChange={(next) => {
        setPeriod(next)
        setSelectedDay(null)
      }}
      canGoNext={month < latestMonth}
      onPrevMonth={() => changeMonth(-1)}
      onNextMonth={() => changeMonth(1)}
      search={search}
      onSearchChange={setSearch}
      kind={kind}
      onKindChange={setKind}
      categories={(categories.data ?? []).filter((c) => c.archivedAt === null)}
      categoriesById={categoriesById}
      accountNamesById={accountNamesById}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      selectedDay={selectedDay}
      onSelectDay={setSelectedDay}
      calendarDays={calendarDays}
      totals={totals}
      days={days}
      groups={groups}
      view={view}
      onViewChange={changeView}
      noMovements={(transactions.data ?? []).length === 0 && (transfers.data ?? []).length === 0}
      onEdit={openEdit}
      onVoid={handleVoid}
    />
  )
}
