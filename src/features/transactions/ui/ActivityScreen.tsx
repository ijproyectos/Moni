import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Scale, Search } from 'lucide-react'
import { useState } from 'react'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatLongDay, formatMonthYear, formatRelativeDay } from '@/shared/lib/dates'
import type { Cents } from '@/shared/lib/money'
import { formatArs } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle, IconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import {
  countEntries,
  type ActivityDay,
  type ActivityEntry,
  type CategoryGroup,
} from '../domain/activity'
import type { ActivityPeriod } from '../domain/activityPeriod'
import type { ActivityView } from '../domain/activityView'
import {
  addsToBalance,
  isAdjustment,
  isOpening,
  isScheduled,
  type EntryKind,
  type Transaction,
} from '../domain/transaction'
import type { CalendarDayTotal } from '../domain/transactionQueries'
import { ActivityCalendar, ActivityWeekStrip } from './ActivityCalendar'

type KindFilter = 'all' | EntryKind

interface ActivityScreenProps {
  month: IsoDate
  /** The summary card is about `month` (calendar view, or the "Por mes" filter); otherwise it covers everything. */
  monthScoped: boolean
  period: ActivityPeriod
  onPeriodChange: (period: ActivityPeriod) => void
  canGoNext: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  search: string
  onSearchChange: (value: string) => void
  kind: KindFilter
  onKindChange: (kind: KindFilter) => void
  categories: readonly Category[]
  categoriesById: ReadonlyMap<string, Category>
  accountNamesById: ReadonlyMap<string, string>
  categoryId: string | null
  onCategoryChange: (id: string | null) => void
  selectedDay: IsoDate | null
  onSelectDay: (day: IsoDate | null) => void
  calendarDays: readonly CalendarDayTotal[]
  totals: { expenseCents: Cents; incomeCents: Cents }
  days: readonly ActivityDay[]
  /** Same movements as `days`, grouped by category (list view). */
  groups: readonly CategoryGroup[]
  view: ActivityView
  onViewChange: (view: ActivityView) => void
  /** True when there are no movements at all (distinct from "filters match nothing"). */
  noMovements: boolean
  onEdit: (transaction: Transaction) => void
  /** Voids a movement or transfer; rejects with a user-safe message on failure. */
  onVoid: (entry: ActivityEntry) => Promise<void>
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todo' },
  { value: 'month', label: 'Por mes' },
] as const

function countLabel(kind: KindFilter, count: number): string {
  const one = count === 1
  if (kind === 'expense') return one ? 'gasto' : 'gastos'
  if (kind === 'income') return one ? 'ingreso' : 'ingresos'
  return one ? 'movimiento' : 'movimientos'
}

export function ActivityScreen(props: ActivityScreenProps) {
  const { days, categoriesById, accountNamesById, kind, categories } = props
  const [pendingVoid, setPendingVoid] = useState<ActivityEntry | null>(null)
  const [isVoiding, setIsVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const today = todayIso()
  const count = countEntries(days)
  const chipCategories = kind === 'all' ? categories : categories.filter((c) => c.kind === kind)
  const calendarView = props.view === 'calendar'
  // The day grid belongs to the calendar view; it opens from "Ver el mes completo".
  const gridOpen = calendarView && props.monthScoped && expanded
  const elapsed = Math.max(1, props.calendarDays.filter((d) => d.date <= today).length)
  const searching = searchOpen || props.search !== ''

  function toggleKind(next: EntryKind) {
    props.onKindChange(kind === next ? 'all' : next)
    props.onCategoryChange(null)
  }

  async function confirmVoid() {
    if (!pendingVoid) return
    setIsVoiding(true)
    setVoidError(null)
    try {
      await props.onVoid(pendingVoid)
      setPendingVoid(null)
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : 'No pudimos anular el movimiento.')
    } finally {
      setIsVoiding(false)
    }
  }

  function renderEntry(entry: ActivityEntry) {
    return (
      <li key={`${entry.type}-${entry.id}`}>
        {entry.type === 'transaction' ? (
          <TransactionRow
            transaction={entry.transaction}
            category={
              entry.transaction.categoryId
                ? categoriesById.get(entry.transaction.categoryId)
                : undefined
            }
            today={today}
            onEdit={() => props.onEdit(entry.transaction)}
            onDelete={() => setPendingVoid(entry)}
          />
        ) : (
          <MovementRow
            leading={<IconCircle icon={ArrowLeftRight} color="#1c5030" />}
            title={entry.transfer.note?.trim() || 'Transferencia'}
            subtitle={`${formatRelativeDay(entry.occurredOn, today)} · ${accountNamesById.get(entry.transfer.fromAccountId) ?? 'Cuenta'} → ${accountNamesById.get(entry.transfer.toAccountId) ?? 'Cuenta'}`}
            trailing={<AmountDisplay cents={entry.transfer.amountCents} className="text-ink" />}
            onDelete={() => setPendingVoid(entry)}
            deleteLabel="Anular transferencia"
          />
        )}
      </li>
    )
  }

  return (
    <section className="figma-scale flex flex-col pb-4 pt-8">
      <header className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-h-11 items-center gap-1">
              {props.monthScoped && !gridOpen && (
                <button
                  type="button"
                  onClick={props.onPrevMonth}
                  aria-label="Mes anterior"
                  className="-ml-2 flex size-9 items-center justify-center rounded-full text-text-muted"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
                </button>
              )}
              <p className="font-display text-xl font-medium text-text-muted">
                {props.monthScoped ? formatMonthYear(props.month) : 'Todo el historial'}
              </p>
              {props.monthScoped && !gridOpen && (
                <button
                  type="button"
                  onClick={props.onNextMonth}
                  disabled={!props.canGoNext}
                  aria-label="Mes siguiente"
                  className="flex size-9 items-center justify-center rounded-full text-text-muted disabled:opacity-40"
                >
                  <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2} />
                </button>
              )}
            </div>
            <h1 className="font-display text-[clamp(32px,10vw,40px)] font-extrabold leading-tight">
              Actividad
            </h1>
            <p className="text-[15px] text-text-muted">{`${count} ${countLabel(kind, count)}`}</p>
          </div>
          <button
            type="button"
            aria-label="Buscar"
            aria-expanded={searching}
            onClick={() => setSearchOpen((open) => !open)}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-sm"
          >
            <Search aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        </div>

        {searching && (
          <label className="relative mt-3 block">
            <span className="sr-only">Buscar por nota o categoría</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-muted"
              strokeWidth={2}
            />
            <input
              type="search"
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Buscar por nota o categoría…"
              className="h-12 w-full rounded-full border border-line bg-card pl-12 pr-4 text-[17px] text-ink placeholder:text-text-muted"
            />
          </label>
        )}

        <div role="group" aria-label="Gastos e ingresos" className="mt-5 flex">
          <button
            type="button"
            aria-pressed={kind === 'expense'}
            onClick={() => toggleKind('expense')}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-start rounded-[16px] px-2 py-1 text-left',
              kind === 'expense' && 'bg-sand',
            )}
          >
            <span className="text-[15px] text-text-muted">Gastos</span>
            <AmountDisplay
              cents={props.totals.expenseCents}
              className="font-display text-[clamp(26px,8.5vw,34px)] font-extrabold leading-tight text-expense"
            />
          </button>
          <span aria-hidden="true" className="mx-2 w-px self-stretch bg-line" />
          <button
            type="button"
            aria-pressed={kind === 'income'}
            onClick={() => toggleKind('income')}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-start rounded-[16px] px-2 py-1 text-left',
              kind === 'income' && 'bg-sand',
            )}
          >
            <span className="text-[15px] text-text-muted">Ingresos</span>
            <AmountDisplay
              cents={props.totals.incomeCents}
              className="font-display text-[clamp(26px,8.5vw,34px)] font-extrabold leading-tight text-income"
            />
          </button>
        </div>
        <p className="mt-3 text-[15px] text-text-muted">
          Tocá Gastos o Ingresos para filtrar la lista.
          {kind === 'expense' && props.monthScoped && (
            <>
              {' '}
              Por día{' '}
              <AmountDisplay
                cents={Math.round(props.totals.expenseCents / elapsed / 100) * 100}
                className="font-extrabold text-ink"
              />
            </>
          )}
        </p>
      </header>

      <div className="mt-5 px-5">
        {gridOpen ? (
          <ActivityCalendar
            month={props.month}
            days={props.calendarDays}
            selectedDay={props.selectedDay}
            canGoNext={props.canGoNext}
            onPrev={props.onPrevMonth}
            onNext={props.onNextMonth}
            onSelectDay={props.onSelectDay}
            kind={kind}
          />
        ) : (
          calendarView &&
          props.monthScoped && (
            <ActivityWeekStrip
              days={props.calendarDays}
              selectedDay={props.selectedDay}
              kind={kind}
              onSelectDay={props.onSelectDay}
            />
          )
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          {calendarView && props.monthScoped ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              className="flex min-h-11 items-center gap-2 font-display text-[16px] font-extrabold text-text-muted"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                strokeWidth={3}
              />
              {expanded ? 'Ocultar el calendario' : 'Ver el mes completo'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => props.onViewChange(calendarView ? 'list' : 'calendar')}
            className="min-h-11 font-display text-[16px] font-extrabold text-text-muted"
          >
            {calendarView ? 'Agrupar por categoría' : 'Ver por día'}
          </button>
        </div>
        <div className="mb-1 mt-2">
          <SegmentedControl
            label="Período"
            options={PERIOD_OPTIONS}
            value={props.period}
            onChange={props.onPeriodChange}
          />
        </div>
      </div>

      {chipCategories.length > 0 && (
        <div className="mt-4">
          <p className="px-5 text-[15px] font-semibold text-text-muted">Categorías</p>
          <div
            role="group"
            aria-label="Filtrar por categoría"
            className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-5"
          >
            <CategoryChip
              label="Todas"
              selected={props.categoryId === null}
              onClick={() => props.onCategoryChange(null)}
            />
            {chipCategories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                selected={props.categoryId === c.id}
                onClick={() => props.onCategoryChange(props.categoryId === c.id ? null : c.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 px-5">
        {count === 0 ? (
          <EmptyState
            mascotUrl={mascotAnalyst}
            title={props.noMovements ? 'Todavía no hay movimientos' : 'No encontramos movimientos'}
            description={
              props.noMovements
                ? 'Cuando cargues gastos o ingresos, los ves acá.'
                : 'Probá con otra búsqueda o sacá algún filtro.'
            }
          />
        ) : !calendarView ? (
          props.groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="mb-4">
              <div className="mb-1 flex items-center gap-3 border-b border-line py-2">
                <GroupIcon group={group} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-[17px] font-extrabold">
                    {group.label}
                  </h2>
                  <p className="text-[14px] text-text-muted">
                    {`${group.count} ${group.count === 1 ? 'movimiento' : 'movimientos'}`}
                  </p>
                </div>
                <AmountDisplay
                  cents={group.direction === 'out' ? -group.totalCents : group.totalCents}
                  signed={group.direction !== 'neutral'}
                  className={cn(
                    'font-display text-[17px] font-extrabold',
                    group.direction === 'in' ? 'text-income' : 'text-ink',
                  )}
                />
              </div>
              <ul className="divide-y divide-line">{group.entries.map(renderEntry)}</ul>
            </section>
          ))
        ) : (
          days.map((day) => (
            <section key={day.date} aria-label={formatLongDay(day.date)} className="mb-4">
              <div className="flex items-baseline justify-between border-b border-line py-2">
                <h2 className="font-display text-[16px] font-extrabold text-text-muted">
                  {formatLongDay(day.date)}
                </h2>
                {day.scheduledCents > 0 && !day.entries.some((e) => isExecuted(e, today)) ? (
                  <span className="font-display text-[15px] font-extrabold text-text-muted">
                    Programado {formatArs(-day.scheduledCents)}
                  </span>
                ) : (
                  <AmountDisplay
                    cents={day.netCents}
                    signed
                    className={`font-display text-[16px] font-extrabold ${day.netCents < 0 ? 'text-expense' : 'text-income'}`}
                  />
                )}
              </div>
              <ul className="divide-y divide-line">{day.entries.map(renderEntry)}</ul>
            </section>
          ))
        )}
      </div>

      {pendingVoid && (
        <ConfirmDialog
          title={
            pendingVoid.type === 'transfer'
              ? '¿Anular esta transferencia?'
              : pendingVoid.transaction.installmentPlanId
                ? '¿Anular la compra en cuotas?'
                : '¿Anular este movimiento?'
          }
          message={
            voidError ??
            (pendingVoid.type === 'transaction' && pendingVoid.transaction.installmentPlanId
              ? 'Se anulan todas las cuotas de esta compra, también las que todavía no llegaron, y baja tu deuda. Esta acción no se puede deshacer.'
              : 'Lo sacamos de tus balances y totales. Esta acción no se puede deshacer.')
          }
          confirmLabel="Anular"
          isBusy={isVoiding}
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            setPendingVoid(null)
            setVoidError(null)
          }}
        />
      )}
    </section>
  )
}

function GroupIcon({ group }: { group: CategoryGroup }) {
  if (group.type === 'category')
    return <CategoryIconCircle iconName={group.category?.icon} color={group.category?.color} />
  if (group.type === 'transfer') return <IconCircle icon={ArrowLeftRight} color="#1c5030" />
  if (group.type === 'uncategorized') return <CategoryIconCircle iconName={null} />
  return <IconCircle icon={Scale} color="#1c5030" />
}

function TransactionRow({
  transaction,
  category,
  today,
  onEdit,
  onDelete,
}: {
  transaction: Transaction
  category: Category | undefined
  today: IsoDate
  onEdit: () => void
  onDelete: () => void
}) {
  const isIncome = addsToBalance(transaction.kind)
  const opening = isOpening(transaction.kind)
  // Adjustments and the starting balance move the balance only; they have no category.
  const adjustment = isAdjustment(transaction.kind) || opening
  const categoryName = opening
    ? 'Saldo inicial'
    : adjustment
      ? 'Ajuste de saldo'
      : (category?.name ?? 'Sin categoría')
  // Only expenses and incomes can be edited; an adjustment is undone by voiding it.
  const editable =
    (transaction.kind === 'expense' || transaction.kind === 'income') &&
    transaction.installmentPlanId === null
  const scheduled = isScheduled(transaction, today)
  const installment =
    transaction.installmentNumber !== null && transaction.installmentsTotal !== null
      ? `cuota ${transaction.installmentNumber}/${transaction.installmentsTotal}`
      : null
  return (
    <MovementRow
      leading={
        adjustment ? (
          <IconCircle icon={Scale} color="#1c5030" />
        ) : (
          <CategoryIconCircle iconName={category?.icon} color={category?.color} />
        )
      }
      title={
        installment
          ? `${transaction.note?.trim() || categoryName} · ${installment}`
          : transaction.note?.trim() || categoryName
      }
      subtitle={
        scheduled
          ? `Programada · cierra el ${formatRelativeDay(transaction.occurredOn, today)} · ${categoryName}`
          : adjustment
            ? formatRelativeDay(transaction.occurredOn, today)
            : `${formatRelativeDay(transaction.occurredOn, today)} · ${categoryName}`
      }
      trailing={
        <AmountDisplay
          cents={isIncome ? transaction.amountCents : -transaction.amountCents}
          signed
          className={
            scheduled
              ? 'text-text-muted'
              : adjustment
                ? 'text-ink'
                : isIncome
                  ? 'text-income'
                  : 'text-expense'
          }
        />
      }
      onPress={editable ? onEdit : undefined}
      pressLabel={editable ? `Editar ${transaction.note?.trim() || categoryName}` : undefined}
      // The starting balance is fixed history: a wrong balance is fixed with "Ajustar saldo".
      onDelete={opening ? undefined : onDelete}
      deleteLabel={`Anular ${transaction.note?.trim() || categoryName}`}
    />
  )
}

function isExecuted(entry: ActivityEntry, today: IsoDate): boolean {
  return entry.type === 'transfer' || !isScheduled(entry.transaction, today)
}
