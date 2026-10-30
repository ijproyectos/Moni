import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { formatCompactDate, formatDayMonth, formatMonthName } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ChoiceChip, SectionLabel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { toUserMessage } from '@/shared/lib/errors'
import { useFixedExpenses, useSkipOccurrence } from '../api/useFixedExpenses'
import {
  historyItems,
  monthlyEstimateCents,
  paidInMonthCents,
  pendingBills,
  splitPendingBills,
  upcomingExpenses,
  type FixedExpense,
  type FixedStatus,
  type PendingBill,
} from '../domain/fixedExpense'
import { dueText } from '../domain/labels'
import { FixedExpenseDetailSheet } from './FixedExpenseDetailSheet'
import { FixedExpenseFormSheet } from './FixedExpenseFormSheet'
import { PaymentRow, SkippedRow } from './FixedHistoryRow'
import { KindTile } from './KindTile'
import { RegisterPaymentSheet } from './RegisterPaymentSheet'
import { RescheduleSheet } from './RescheduleSheet'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'

const HISTORY_SHOWN = 10
const FILTERS = [
  { value: 'active', label: 'Activos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'removed', label: 'Eliminados' },
] as const

/** Pagos recurrentes › Gastos fijos: pending bills, upcoming due dates and the history of payments. */
export function FixedExpensesPanel({ onAdd }: { onAdd: () => void }) {
  const toast = useToast()
  const query = useFixedExpenses()
  const skip = useSkipOccurrence()
  const [filter, setFilter] = useState<FixedStatus>('active')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<FixedExpense | null>(null)
  const [paying, setPaying] = useState<PendingBill | null>(null)
  const [moving, setMoving] = useState<PendingBill | null>(null)
  const [skipping, setSkipping] = useState<PendingBill | null>(null)
  const [showAll, setShowAll] = useState(false)

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
  const { expenses, payments, today } = overview
  const monthName = formatMonthName(today).toLowerCase()
  const active = expenses.filter((e) => e.status === 'active')
  const { active: bills, paused: pausedBills } = splitPendingBills(pendingBills(overview))
  const upcoming = upcomingExpenses(expenses)
  const history = historyItems(overview)
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN)
  const occurrences = new Map(overview.occurrences.map((o) => [o.id, o]))
  const open = openId ? expenses.find((e) => e.id === openId) : undefined
  const others = expenses.filter((e) => e.status === filter)
  const byId = new Map(expenses.map((e) => [e.id, e]))

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

  return (
    <>
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Estimado por mes
        </p>
        <p className="font-display text-[36px] font-extrabold leading-[42px]">
          {formatArs(monthlyEstimateCents(expenses))}
        </p>
        <p className="text-[13px] text-text-muted-on-dark">
          Según los importes estimados de {active.length}{' '}
          {active.length === 1 ? 'gasto fijo activo' : 'gastos fijos activos'}.
        </p>
        <div className="mt-3 border-t border-white/15 pt-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
            Pagado en {monthName}
          </p>
          <p className="font-display text-[28px] font-extrabold leading-9 text-lime">
            {formatArs(paidInMonthCents(payments, today))}
          </p>
          <p className="text-[13px] text-text-muted-on-dark">
            Lo que realmente registraste como pagado.
          </p>
        </div>
      </section>

      {expenses.length === 0 && (
        <div className="rounded-[24px] border border-sand bg-card p-4">
          <EmptyState
            mascotUrl={mascotAssistant}
            title="Todavía no cargaste gastos fijos"
            description="Luz, gas, alquiler, expensas… Moni te avisa cuando vencen y vos registrás lo que pagaste."
            action={<Button onClick={onAdd}>Agregar un gasto fijo</Button>}
          />
        </div>
      )}

      {expenses.length > 0 && (
        <div role="group" aria-label="Ver" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <ChoiceChip
              key={f.value}
              selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className="min-h-11 px-3 text-[15px]"
            >
              {f.label}
            </ChoiceChip>
          ))}
        </div>
      )}

      {filter !== 'active' && expenses.length > 0 && (
        <>
          {filter === 'paused' && pausedBills.length > 0 && (
            <>
              <SectionLabel>Vencimientos pendientes de gastos pausados</SectionLabel>
              <p className="-mt-2 text-[14px] leading-5 text-text-muted">
                Ya habían vencido antes de pausar. Podés registrar el pago, cambiar la fecha u
                omitirlos.
              </p>
              <ul className="flex flex-col gap-3">
                {pausedBills.map((bill) => (
                  <PendingBillCard
                    key={bill.occurrence.id}
                    bill={bill}
                    onPay={setPaying}
                    onMove={setMoving}
                    onSkip={setSkipping}
                  />
                ))}
              </ul>
            </>
          )}
          <SectionLabel>{filter === 'paused' ? 'Pausados' : 'Seguimiento eliminado'}</SectionLabel>
          {others.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay gastos fijos en esta lista.</p>
          ) : (
            <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
              {others.map((e) => (
                <ExpenseRow key={e.id} expense={e} muted onOpen={() => setOpenId(e.id)} />
              ))}
            </ul>
          )}
        </>
      )}

      {filter === 'active' && expenses.length > 0 && (
        <>
          <SectionLabel>Pendientes de confirmar</SectionLabel>
          {bills.length === 0 ? (
            <p className="text-[15px] text-text-muted">No tenés vencimientos pendientes.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bills.map((bill) => (
                <PendingBillCard
                  key={bill.occurrence.id}
                  bill={bill}
                  onPay={setPaying}
                  onMove={setMoving}
                  onSkip={setSkipping}
                />
              ))}
            </ul>
          )}

          {pausedBills.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter('paused')}
              className="rounded-[18px] border border-dashed border-line px-4 py-3 text-left text-[15px] leading-5"
            >
              Tenés <strong>{pausedBills.length}</strong>{' '}
              {pausedBills.length === 1 ? 'vencimiento pendiente' : 'vencimientos pendientes'} de
              gastos pausados. <span className="font-extrabold underline">Verlos</span>
            </button>
          )}

          <SectionLabel>Próximos vencimientos</SectionLabel>
          {upcoming.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay gastos fijos activos.</p>
          ) : (
            <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
              {upcoming.map((e) => (
                <ExpenseRow key={e.id} expense={e} onOpen={() => setOpenId(e.id)} />
              ))}
            </ul>
          )}

          <SectionLabel>Historial de pagos</SectionLabel>
          {history.length === 0 ? (
            <p className="text-[15px] text-text-muted">Todavía no registraste pagos.</p>
          ) : (
            <>
              <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
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

function ExpenseRow({
  expense: e,
  muted = false,
  onOpen,
}: {
  expense: FixedExpense
  muted?: boolean
  onOpen: () => void
}) {
  const per =
    e.period === 'yearly' ? 'por año' : e.period === 'bimonthly' ? 'cada dos meses' : 'por mes'
  const when =
    e.status === 'active'
      ? `vence el ${formatDayMonth(e.nextDueOn)}`
      : e.status === 'paused'
        ? 'pausado'
        : 'seguimiento eliminado'
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${e.name}, ${when}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <KindTile kindId={e.kindId} size="md" className={muted ? 'opacity-60' : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-extrabold">{e.name}</span>
          <span className="block text-[15px] leading-5 text-text-muted">
            {when} · {e.accountName}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[18px] font-extrabold">≈ {formatArs(e.amountCents)}</span>
          <span className="block text-[14px] text-text-muted">{per}</span>
        </span>
      </button>
    </li>
  )
}

function PendingBillCard({
  bill,
  onPay,
  onMove,
  onSkip,
}: {
  bill: PendingBill
  onPay: (bill: PendingBill) => void
  onMove: (bill: PendingBill) => void
  onSkip: (bill: PendingBill) => void
}) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-[24px] border bg-card p-4',
        bill.state === 'overdue' ? 'border-expense/50' : 'border-sand',
      )}
    >
      <div className="flex items-center gap-3">
        <KindTile kindId={bill.expense.kindId} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-extrabold">{bill.expense.name}</span>
          <span
            className={cn(
              'block text-[14px] leading-5',
              bill.state === 'overdue' ? 'font-extrabold text-expense' : 'text-text-muted',
            )}
          >
            {dueText(bill)}
          </span>
          <span className="block text-[14px] leading-5 text-text-muted">
            {bill.expense.accountName}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[17px] font-extrabold">
            ≈ {formatArs(bill.occurrence.expectedCents)}
          </span>
          <span className="block text-[13px] text-text-muted">estimado</span>
        </span>
      </div>
      <Button
        variant="dark"
        onClick={() => onPay(bill)}
        aria-label={`Registrar pago de ${bill.expense.name}`}
      >
        Registrar pago
      </Button>
      <div className="flex gap-5">
        <button
          type="button"
          onClick={() => onMove(bill)}
          aria-label={`Cambiar fecha de ${bill.expense.name}`}
          className="text-[15px] font-extrabold text-ink underline"
        >
          Cambiar fecha
        </button>
        <button
          type="button"
          onClick={() => onSkip(bill)}
          aria-label={`Omitir ${bill.expense.name}`}
          className="text-[15px] font-extrabold text-ink underline"
        >
          Omitir
        </button>
      </div>
    </li>
  )
}
