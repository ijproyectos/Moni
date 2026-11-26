import { Check, Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { useCategories } from '@/features/categories/api/useCategories'
import type { Category } from '@/features/categories/domain/category'
import { useAnts } from '@/features/insights/api/useAnts'
import { AntBadge } from '@/features/insights/ui/AntBadge'
import { formatCompactDate, formatDayMonth } from '@/shared/lib/dates'
import { useFormatMoney } from '@/shared/ui/useFormatMoney'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Kicker } from '@/shared/ui/Kicker'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { toUserMessage } from '@/shared/lib/errors'
import { useFixedExpenses, useSkipOccurrence } from '../api/useFixedExpenses'
import {
  antFixedExpenses,
  historyItems,
  monthlyAmountCents,
  type FixedExpense,
  type PendingBill,
} from '../domain/fixedExpense'
import { findKind } from '../domain/catalog'
import { debitStatusText, monthDebits, nextDebitText, type MonthDebitRow } from '../domain/monthDebits'
import { FixedExpenseDetailSheet } from './FixedExpenseDetailSheet'
import { FixedExpenseFormSheet } from './FixedExpenseFormSheet'
import { PaymentRow, SkippedRow } from './FixedHistoryRow'
import { RegisterPaymentSheet } from './RegisterPaymentSheet'
import { RescheduleSheet } from './RescheduleSheet'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'

function CategoryFilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13.5px] font-medium',
        FOCUS_RING,
        selected ? 'bg-ink text-canvas' : 'bg-card text-ink',
      )}
    >
      {children}
    </button>
  )
}

const HISTORY_SHOWN = 10
const FILTERS = [
  { value: 'active', label: 'Activos' },
  { value: 'removed', label: 'Eliminados' },
] as const

/** Pagos recurrentes › Gastos fijos: pending bills, upcoming due dates and the history of payments. */
export function FixedExpensesPanel({
  onAdd,
  onCount,
}: {
  onAdd: () => void
  /** Tells the page how many active fixed expenses there are, for its subtitle (null while unknown). */
  onCount?: (summary: string | null) => void
}) {
  const toast = useToast()
  const formatMoney = useFormatMoney()
  const query = useFixedExpenses()
  const categoriesQuery = useCategories()
  const skip = useSkipOccurrence()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('active')
  // A push opens the fixed expense it is about: ?gasto=<id>.
  const [params] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(() => params.get('gasto'))
  const [editing, setEditing] = useState<FixedExpense | null>(null)
  const [paying, setPaying] = useState<PendingBill | null>(null)
  const [moving, setMoving] = useState<PendingBill | null>(null)
  const [skipping, setSkipping] = useState<PendingBill | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const categoriesById = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c]))
  const antsQuery = useAnts(query.data?.today ?? new Date().toISOString().slice(0, 10))
  const thresholdCents = antsQuery.data?.thresholdCents ?? null
  const loaded = query.data
  useEffect(() => {
    if (!onCount) return
    const active = loaded?.expenses.filter((e) => e.status === 'active') ?? []
    if (!loaded || active.length === 0) return onCount(null)
    const monthly = active.every((e) => e.period === 'monthly')
    onCount(
      monthly
        ? `${active.length} ${active.length === 1 ? 'débito' : 'débitos'} por mes`
        : `${active.length} ${active.length === 1 ? 'gasto fijo activo' : 'gastos fijos activos'}`,
    )
  }, [loaded, onCount])

  if (query.isLoading) {
    return (
      <div role="status" aria-label="Cargando gastos fijos" className="flex flex-col gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-20" />
        <Skeleton className="h-16" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState
        mascotUrl={mascotAlert}
        title="No pudimos cargar tus gastos fijos"
        description="Revisá tu conexión y probá de nuevo."
        action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
      />
    )
  }

  const overview = query.data
  const { expenses } = overview
  const chipCategories = [...new Set(expenses.map((e) => e.categoryId))]
    .map((id) => categoriesById.get(id))
    .filter((c): c is Category => Boolean(c))
    .sort((a, b) => a.name.localeCompare(b.name))
  const matchesFilter = (e: FixedExpense) => categoryFilter === null || e.categoryId === categoryFilter
  const history = historyItems(overview).filter((item) => matchesFilter(item.expense))
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN)
  const occurrences = new Map(overview.occurrences.map((o) => [o.id, o]))
  const open = openId ? expenses.find((e) => e.id === openId) : undefined
  const others = expenses.filter((e) => e.status === filter && matchesFilter(e))
  const removed = expenses.filter((e) => e.status === 'removed')
  const byId = new Map(expenses.map((e) => [e.id, e]))
  const ants = thresholdCents !== null ? antFixedExpenses(expenses, thresholdCents) : []
  const antTotalCents = ants.reduce((sum, e) => sum + monthlyAmountCents(e), 0)

  async function confirmSkip() {
    if (!skipping) return
    const bill = skipping
    setSkipping(null)
    try {
      await skip.mutateAsync(bill.occurrence.id)
      toast.show(`${bill.expense.name} omitido`)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  const debits = monthDebits(overview)
  const paidShare = debits.totalCents > 0 ? debits.paidCents : 0
  const visibleDebitRows = debits.rows.filter((row) => matchesFilter(row.expense))
  const visibleLater = debits.later.filter(matchesFilter)

  return (
    <>
      {expenses.length > 0 && filter === 'active' && (
        <>
          <section
            aria-labelledby="debits-title"
            className="flex flex-col gap-2.5 rounded-[28px] bg-card p-4"
          >
            <Kicker as="h2" className="font-medium">
              <span id="debits-title">Faltan debitar este mes</span>
            </Kicker>
            <div className="flex items-baseline justify-between gap-2">
              <AmountDisplay
                cents={debits.pendingCents}
                className="text-[38px] font-bold leading-none tracking-[-0.04em]"
              />
              <span className="text-[13px] text-text-muted">
                de <AmountDisplay cents={debits.totalCents} />
              </span>
            </div>
            {debits.totalCents > 0 && (
              <div
                role="img"
                aria-label={`Pagado ${formatMoney(debits.paidCents)}, por venir ${formatMoney(debits.pendingCents)}`}
                className="flex gap-[3px]"
              >
                <span
                  className="h-2 rounded-full bg-mint"
                  style={{ flex: paidShare, display: paidShare > 0 ? 'block' : 'none' }}
                />
                <span
                  className="h-2 rounded-full bg-[#E8B931]"
                  style={{
                    flex: debits.pendingCents,
                    display: debits.pendingCents > 0 ? 'block' : 'none',
                  }}
                />
              </div>
            )}
            <div className="flex gap-3.5 text-[12px] text-[#4F6157] dark:text-text-muted">
              <span className="flex items-center gap-[5px]">
                <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-mint" />
                Pagado
              </span>
              <span className="flex items-center gap-[5px]">
                <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-[#E8B931]" />
                Por venir
              </span>
            </div>
            {ants.length > 0 && (
              <p className="text-[13px] text-text-muted">
                Tenés {ants.length} {ants.length === 1 ? 'gasto fijo chico' : 'gastos fijos chicos'}{' '}
                {ants.length === 1 ? 'que suma' : 'que suman'}{' '}
                {formatMoney(antTotalCents)} por mes — del tipo que se olvida que se paga.
              </p>
            )}
          </section>

          {chipCategories.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar por categoría"
              className="no-scrollbar -mr-[18px] flex shrink-0 gap-2 overflow-x-auto pr-[18px]"
            >
              <CategoryFilterChip selected={categoryFilter === null} onClick={() => setCategoryFilter(null)}>
                Todas
              </CategoryFilterChip>
              {chipCategories.map((c) => (
                <CategoryFilterChip
                  key={c.id}
                  selected={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
                >
                  {c.name}
                </CategoryFilterChip>
              ))}
            </div>
          )}

          {debits.next && (
            <div className="flex items-center gap-3 rounded-[18px] bg-sun px-3.5 py-2.5">
              <img src={mascotAssistant} alt="" className="size-[30px] rounded-full" />
              <p className="text-[13.5px] text-[#2F3A24]">{nextDebitText(debits.next)}</p>
            </div>
          )}

          {visibleDebitRows.length > 0 && (
            <ul aria-label="Gastos fijos de este mes" className="rounded-[26px] bg-card px-4 py-0.5">
              {visibleDebitRows.map((row) => (
                <DebitRow
                  key={row.key}
                  row={row}
                  category={categoriesById.get(row.expense.categoryId)}
                  isAnt={thresholdCents !== null && monthlyAmountCents(row.expense) <= thresholdCents}
                  onOpen={() => setOpenId(row.expense.id)}
                  onPay={setPaying}
                  onMove={setMoving}
                  onSkip={setSkipping}
                />
              ))}
            </ul>
          )}

          {visibleLater.length > 0 && (
            <>
              <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                Próximos vencimientos
              </h2>
              <ul className="rounded-[26px] bg-card px-4 py-0.5">
                {visibleLater.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    category={categoriesById.get(e.categoryId)}
                    isAnt={thresholdCents !== null && monthlyAmountCents(e) <= thresholdCents}
                    onOpen={() => setOpenId(e.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {history.length > 0 && (
            <>
              <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                Historial de pagos
              </h2>
              <ul className="divide-y divide-line rounded-[26px] bg-card py-0.5">
                {shown.map((item) => {
                  if (item.type === 'payment') {
                    return (
                      <PaymentRow
                        key={item.payment.id}
                        payment={item.payment}
                        occurrence={occurrences.get(item.payment.occurrenceId)}
                        expense={item.expense}
                        onOpen={() => setOpenId(item.expense.id)}
                      />
                    )
                  }
                  return (
                    <SkippedRow
                      key={item.occurrence.id}
                      occurrence={item.occurrence}
                      expense={item.expense}
                      onOpen={() => setOpenId(item.expense.id)}
                    />
                  )
                })}
              </ul>
              {history.length > HISTORY_SHOWN && !showAll && (
                <Button variant="ghost" className="text-ink" onClick={() => setShowAll(true)}>
                  Ver todo el historial
                </Button>
              )}
            </>
          )}
        </>
      )}

      {expenses.length === 0 && (
        <div className="rounded-[26px] bg-card p-4">
          <EmptyState
            mascotUrl={mascotAssistant}
            title="Todavía no cargaste gastos fijos"
            description="Luz, gas, alquiler, expensas… Moni te avisa cuando vencen y vos registrás lo que pagaste."
            action={<Button onClick={onAdd}>Agregar un gasto fijo</Button>}
          />
        </div>
      )}

      {filter !== 'active' && expenses.length > 0 && (
        <>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
            Seguimiento eliminado
          </h2>
          {others.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay gastos fijos en esta lista.</p>
          ) : (
            <ul className="rounded-[26px] bg-card px-4 py-0.5">
              {others.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  category={categoriesById.get(e.categoryId)}
                  muted
                  onOpen={() => setOpenId(e.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {removed.length > 0 && (
        <SegmentedControl
          variant="menta"
          label="Ver"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
      )}

      {open && !editing && (
        <FixedExpenseDetailSheet
          expense={byId.get(open.id) ?? open}
          overview={overview}
          onEdit={() => setEditing(open)}
          onClose={() => setOpenId(null)}
        />
      )}
      {editing && (
        <FixedExpenseFormSheet
          target={{ kind: 'edit', expense: editing }}
          onClose={() => setEditing(null)}
        />
      )}
      {paying && <RegisterPaymentSheet bill={paying} onClose={() => setPaying(null)} />}
      {moving && <RescheduleSheet bill={moving} onClose={() => setMoving(null)} />}
      {skipping && (
        <ConfirmDialog
          title="¿Omitir este vencimiento?"
          message={`No se registra ningún gasto. ${skipping.expense.name} del ${formatCompactDate(skipping.occurrence.dueOn)} queda en el historial como omitido, y el próximo vencimiento sigue su curso.`}
          confirmLabel="Omitir"
          cancelLabel="Volver"
          isBusy={skip.isPending}
          onConfirm={() => void confirmSkip()}
          onCancel={() => setSkipping(null)}
        />
      )}
    </>
  )
}

function KindCircle({ kindId, muted }: { kindId: string; muted?: boolean }) {
  const Icon = findKind(kindId)?.icon ?? Repeat
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sand text-ink',
        muted && 'opacity-60',
      )}
    >
      <Icon className="size-[17px]" strokeWidth={1.9} />
    </span>
  )
}

/** A fixed expense by its next due date (no bill yet): used for what falls after this month and for removed ones. */
function ExpenseRow({
  expense: e,
  category,
  isAnt = false,
  muted = false,
  onOpen,
}: {
  expense: FixedExpense
  category?: Category
  isAnt?: boolean
  muted?: boolean
  onOpen: () => void
}) {
  const formatMoney = useFormatMoney()
  const per =
    e.period === 'yearly' ? 'por año' : e.period === 'bimonthly' ? 'cada dos meses' : 'por mes'
  const when =
    e.status === 'active'
      ? `vence el ${formatDayMonth(e.nextDueOn)}`
      : e.status === 'paused'
        ? 'pausado'
        : 'seguimiento eliminado'
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${e.name}, ${when}${category ? `, ${category.name}` : ''}${isAnt ? ', gasto hormiga' : ''}`}
        className={cn('grid w-full grid-cols-[38px_1fr_auto] items-center gap-3 py-2 text-left', FOCUS_RING)}
      >
        <KindCircle kindId={e.kindId} muted={muted} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{e.name}</span>
            {isAnt && <AntBadge />}
          </span>
          <span className="block truncate text-[12px] text-text-muted">
            {when} · {category ? `${category.name} · ` : ''}
            {e.accountName}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[15px] font-medium">≈ {formatMoney(e.amountCents)}</span>
          <span className="block text-[11.5px] text-text-muted">{per}</span>
        </span>
      </button>
    </li>
  )
}

const STATUS_TONE: Record<MonthDebitRow['status'], string> = {
  paid: 'text-ok-ink',
  overdue: 'text-bad-ink',
  today: 'text-warn-ink',
  soon: 'text-warn-ink',
  later: 'font-normal text-text-muted',
}

/** One debit of the month: icon, name, "date · account", amount and its state ("Pagado", "En 5 días"...). */
function DebitRow({
  row,
  category,
  isAnt = false,
  onOpen,
  onPay,
  onMove,
  onSkip,
}: {
  row: MonthDebitRow
  category?: Category
  isAnt?: boolean
  onOpen: () => void
  onPay: (bill: PendingBill) => void
  onMove: (bill: PendingBill) => void
  onSkip: (bill: PendingBill) => void
}) {
  const { expense, bill } = row
  const status = debitStatusText(row)
  const action = cn(
    'min-h-11 text-[12.5px] font-semibold text-mint-ink underline-offset-2 hover:underline',
    FOCUS_RING,
  )
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${expense.name}, ${status}${category ? `, ${category.name}` : ''}${isAnt ? ', gasto hormiga' : ''}`}
        className={cn('grid w-full grid-cols-[38px_1fr_auto] items-center gap-3 py-2 text-left', FOCUS_RING)}
      >
        <KindCircle kindId={expense.kindId} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{expense.name}</span>
            {isAnt && <AntBadge />}
          </span>
          <span className="block truncate text-[12px] text-text-muted">
            {formatDayMonth(row.date)} · {category ? `${category.name} · ` : ''}
            {row.accountName}
          </span>
        </span>
        <span className="flex flex-col items-end gap-[3px]">
          <span className="text-[15px] font-medium">
            {row.status === 'paid' ? '' : '≈ '}
            <AmountDisplay cents={row.amountCents} />
          </span>
          <span className={cn('flex items-center gap-[3px] text-[11.5px] font-semibold', STATUS_TONE[row.status])}>
            {row.status === 'paid' && (
              <Check aria-hidden="true" className="size-3" strokeWidth={2.8} />
            )}
            {status}
          </span>
        </span>
      </button>
      {bill && (
        <div className="flex flex-wrap gap-x-4 pb-1 pl-[50px]">
          <button
            type="button"
            onClick={() => onPay(bill)}
            aria-label={`Registrar pago de ${expense.name}`}
            className={action}
          >
            Registrar pago
          </button>
          <button
            type="button"
            onClick={() => onMove(bill)}
            aria-label={`Cambiar fecha de ${expense.name}`}
            className={action}
          >
            Cambiar fecha
          </button>
          <button
            type="button"
            onClick={() => onSkip(bill)}
            aria-label={`Omitir ${expense.name}`}
            className={action}
          >
            Omitir
          </button>
        </div>
      )}
    </li>
  )
}
