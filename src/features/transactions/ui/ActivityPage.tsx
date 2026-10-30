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
import { loadActivityView, saveActivityView, type ActivityView } from '../domain/activityView'
import type { EntryKind } from '../domain/transaction'
import { calendarDayTotals, totalsOf } from '../domain/transactionQueries'
import { ActivityScreen } from './ActivityScreen'
import { useMovementSheet } from './movementSheetContext'

/** Container for Actividad: fetches the month, owns the filters, delegates rendering. */
export function ActivityPage() {
  const latestMonth = monthStart(todayIso())
  const [month, setMonth] = useState<IsoDate>(latestMonth)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | EntryKind>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<IsoDate | null>(null)
  const [view, setView] = useState<ActivityView>(loadActivityView)

  const range = monthRange(month)
  const transactions = useTransactions(range)
  const transfers = useTransfers(range)
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
  const days = useMemo(
    () =>
      buildActivity({
        transactions: transactions.data ?? [],
        transfers: transfers.data ?? [],
        // The day filter belongs to the calendar; it is kept (not applied) while in list view.
        filters: { search, kind, categoryId, day: view === 'calendar' ? selectedDay : null },
        categoriesById,
        accountNamesById,
      }),
    [
      transactions.data,
      transfers.data,
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
  const totals = useMemo(() => totalsOf(transactions.data ?? []), [transactions.data])

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
      monthIsEmpty={(transactions.data ?? []).length === 0 && (transfers.data ?? []).length === 0}
      onEdit={openEdit}
      onVoid={handleVoid}
    />
  )
}
