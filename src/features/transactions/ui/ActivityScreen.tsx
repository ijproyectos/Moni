import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Scale,
  Search,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatLongDay, formatMonthYear, formatRelativeDay, monthNameOf } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { monthStart, todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { SwipeRow } from '@/shared/ui/SwipeRow'
import {
  countEntries,
  type ActivityDay,
  type ActivityEntry,
  type CategoryGroup,
} from '../domain/activity'
import type { ActivityPeriod } from '../domain/activityPeriod'
import type { ActivityView } from '../domain/activityView'
import type { MonthComparison } from '../domain/monthComparison'
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
import { MovementDetail } from './MovementDetail'

type KindFilter = 'all' | EntryKind

interface ActivityScreenProps {
  month: IsoDate
  /** The comparison and the list are about `month` (calendar view, or the "Por mes" filter); otherwise everything. */
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
  /** This month against the previous one up to the same day. */
  comparison: MonthComparison
  /** Every movement: the detail derives its "dato de Moni" from it. */
  transactions: readonly Transaction[]
  days: readonly ActivityDay[]
  /** Same movements as `days`, grouped by category ("list" view). */
  groups: readonly CategoryGroup[]
  view: ActivityView
  onViewChange: (view: ActivityView) => void
  /** True when there are no movements at all (distinct from "filters match nothing"). */
  noMovements: boolean
  onEdit: (transaction: Transaction) => void
  /** Voids a movement or transfer; rejects with a user-safe message on failure. */
  onVoid: (entry: ActivityEntry) => Promise<void>
}

const KIND_OPTIONS = [
  { value: 'all', label: 'Todo' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
] as const

function countLabel(kind: KindFilter, count: number): string {
  const one = count === 1
  if (kind === 'expense') return one ? 'gasto' : 'gastos'
  if (kind === 'income') return one ? 'ingreso' : 'ingresos'
  return one ? 'movimiento' : 'movimientos'
}

function shortMonth(month: IsoDate): string {
  return monthNameOf(month).slice(0, 3)
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const ROUND_BUTTON = cn(
  'flex size-11 items-center justify-center rounded-full bg-card text-ink',
  FOCUS_RING,
)
const SMALL_PILL = cn(
  'rounded-full px-3 py-1 text-[12px] font-medium',
  FOCUS_RING,
)

/** "−13% · gastás menos": tone and words follow the kind (spending less is good, earning less is not). */
function changeChip(c: MonthComparison): { text: string; className: string } | null {
  if (c.deltaPct === null) return null
  const sign = c.deltaPct > 0 ? '+' : c.deltaPct < 0 ? '−' : ''
  const pct = `${sign}${Math.abs(c.deltaPct)}%`
  const expense = c.kind === 'expense'
  if (c.deltaPct === 0) return { text: '0% · igual que el mes pasado', className: 'bg-ok-bg text-ok-ink' }
  const more = c.deltaPct > 0
  const good = expense ? !more : more
  const words = expense ? (more ? 'gastás más' : 'gastás menos') : more ? 'ingresás más' : 'ingresás menos'
  return { text: `${pct} · ${words}`, className: good ? 'bg-ok-bg text-ok-ink' : 'bg-warn-bg text-warn-ink' }
}

function ComparisonCard({ comparison }: { comparison: MonthComparison }) {
  const chip = changeChip(comparison)
  const largest = Math.max(comparison.currentCents, comparison.previousCents, 1)
  const inProgress = comparison.currentMonth === monthStart(todayIso())
  const label = comparison.kind === 'income' ? 'Ingresos' : 'Gastos'
  const widthOf = (cents: number) => `${(cents / largest) * 87}%`
  return (
    <section
      aria-label={`${label}: ${shortMonth(comparison.currentMonth)} contra ${shortMonth(comparison.previousMonth)}`}
      className="flex flex-col gap-2.5 rounded-[26px] bg-card px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <Kicker as="h2" className="font-medium">
          {`${label} · ${shortMonth(comparison.currentMonth)} vs ${shortMonth(comparison.previousMonth)}`}
        </Kicker>
        {chip && (
          <span
            className={cn(
              'whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-semibold',
              chip.className,
            )}
          >
            {chip.text}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[34px_1fr_auto] items-center gap-x-2.5 gap-y-2.5 text-[13px]">
        <span className="text-text-muted">{capitalized(shortMonth(comparison.currentMonth))}</span>
        <div className="h-3 overflow-hidden rounded-full bg-line">
          <span
            aria-hidden="true"
            className="block h-full rounded-full bg-mint"
            style={{ width: widthOf(comparison.currentCents) }}
          />
        </div>
        <AmountDisplay cents={comparison.currentCents} className="font-semibold" />
        <span className="text-text-muted">{capitalized(shortMonth(comparison.previousMonth))}</span>
        <div className="h-3 overflow-hidden rounded-full bg-line">
          <span
            aria-hidden="true"
            className="block h-full rounded-full bg-mint-soft"
            style={{ width: widthOf(comparison.previousCents) }}
          />
        </div>
        <AmountDisplay cents={comparison.previousCents} className="font-medium text-text-muted" />
      </div>
      <p className="text-[12px] text-text-muted">
        {inProgress ? 'Comparado al mismo día del mes' : 'Comparado con el mes completo anterior'}
      </p>
    </section>
  )
}

export function ActivityScreen(props: ActivityScreenProps) {
  const { days, categoriesById, accountNamesById, kind, categories } = props
  const [pendingVoid, setPendingVoid] = useState<ActivityEntry | null>(null)
  const [isVoiding, setIsVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<Transaction | null>(null)
  const today = todayIso()
  const count = countEntries(days)
  const chipCategories = kind === 'all' ? categories : categories.filter((c) => c.kind === kind)
  const calendarView = props.view === 'calendar'
  const groupedView = props.view === 'list'
  // The day grid belongs to the calendar view; it opens from "Ver el mes completo".
  const gridOpen = calendarView && props.monthScoped && expanded
  const searching = searchOpen || props.search !== ''

  /** Switching to the calendar also unfolds the month grid; leaving it folds it. */
  function changeView(next: ActivityView) {
    props.onViewChange(next)
    setExpanded(next === 'calendar')
  }

  function changeKind(next: KindFilter) {
    props.onKindChange(next)
    props.onCategoryChange(null)
  }

  async function confirmVoid() {
    if (!pendingVoid) return
    setIsVoiding(true)
    setVoidError(null)
    try {
      await props.onVoid(pendingVoid)
      setPendingVoid(null)
      setDetail(null)
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : 'No pudimos anular el movimiento.')
    } finally {
      setIsVoiding(false)
    }
  }

  function renderEntry(entry: ActivityEntry, withDay: boolean) {
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
            accountName={accountNamesById.get(entry.transaction.accountId)}
            today={today}
            withDay={withDay}
            onOpen={() => setDetail(entry.transaction)}
            onEdit={() => props.onEdit(entry.transaction)}
            onDelete={() => setPendingVoid(entry)}
          />
        ) : (
          <SwipeRow
            surfaceClassName="bg-card"
            actions={[]}
            leadingAction={{
              label: 'Anular',
              tone: 'danger',
              ariaLabel: 'Anular transferencia',
              onPress: () => setPendingVoid(entry),
            }}
          >
            <RowFace
              icon={<ArrowLeftRight aria-hidden="true" className="size-[17px]" strokeWidth={1.9} />}
              title={entry.transfer.note?.trim() || 'Transferencia'}
              subtitle={`${withDay ? `${formatRelativeDay(entry.occurredOn, today)} · ` : ''}${accountNamesById.get(entry.transfer.fromAccountId) ?? 'Cuenta'} → ${accountNamesById.get(entry.transfer.toAccountId) ?? 'Cuenta'}`}
              amount={<AmountDisplay cents={entry.transfer.amountCents} className="text-ink" />}
            />
          </SwipeRow>
        )}
      </li>
    )
  }

  const detailCategory = detail?.categoryId ? categoriesById.get(detail.categoryId) : undefined

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <header className="grid grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          aria-label="Buscar"
          aria-expanded={searching}
          onClick={() => setSearchOpen((open) => !open)}
          className={ROUND_BUTTON}
        >
          <Search aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em]">
            Movimientos
          </h1>
          <div className="flex items-center justify-center">
            {props.monthScoped && !gridOpen && (
              <button
                type="button"
                onClick={props.onPrevMonth}
                aria-label="Mes anterior"
                className={cn('flex size-6 items-center justify-center rounded-full text-text-muted', FOCUS_RING)}
              >
                <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
              </button>
            )}
            <p className="text-[12.5px] text-text-muted">
              {props.monthScoped ? formatMonthYear(props.month) : 'Todo el historial'}
            </p>
            {props.monthScoped && !gridOpen && (
              <button
                type="button"
                onClick={props.onNextMonth}
                disabled={!props.canGoNext}
                aria-label="Mes siguiente"
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-text-muted disabled:opacity-40',
                  FOCUS_RING,
                )}
              >
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label={calendarView ? 'Ver como lista' : 'Ver calendario'}
          onClick={() => changeView(calendarView ? 'days' : 'calendar')}
          className={ROUND_BUTTON}
        >
          <CalendarDays aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
      </header>

      {searching && (
        <label className="relative block">
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
            className={cn(
              'h-12 w-full rounded-full border border-line bg-card pl-12 pr-4 text-[16px] text-ink placeholder:text-placeholder',
              FOCUS_RING,
            )}
          />
        </label>
      )}

      <SegmentedControl
        variant="menta"
        label="Gastos e ingresos"
        options={KIND_OPTIONS}
        value={kind}
        onChange={changeKind}
      />

      <ComparisonCard comparison={props.comparison} />

      {chipCategories.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por categoría"
          className="no-scrollbar -mr-[18px] flex shrink-0 gap-2 overflow-x-auto pr-[18px]"
        >
          <FilterChip selected={props.categoryId === null} onClick={() => props.onCategoryChange(null)}>
            Todas
          </FilterChip>
          {chipCategories.map((c) => (
            <FilterChip
              key={c.id}
              selected={props.categoryId === c.id}
              onClick={() => props.onCategoryChange(props.categoryId === c.id ? null : c.id)}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>
      )}

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
      {calendarView && props.monthScoped && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className={cn(
            'flex min-h-11 items-center gap-2 self-start text-[14px] font-semibold text-text-muted',
            FOCUS_RING,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')}
            strokeWidth={3}
          />
          {expanded ? 'Ocultar el calendario' : 'Ver el mes completo'}
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-text-muted">{`${count} ${countLabel(kind, count)}`}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={props.period === 'month'}
            onClick={() => props.onPeriodChange(props.period === 'month' ? 'all' : 'month')}
            className={cn(
              SMALL_PILL,
              props.period === 'month' ? 'bg-mint-soft text-mint-ink' : 'bg-card text-text-muted',
            )}
          >
            Por mes
          </button>
          <button
            type="button"
            aria-pressed={groupedView}
            onClick={() => changeView(groupedView ? 'days' : 'list')}
            className={cn(
              SMALL_PILL,
              groupedView ? 'bg-mint-soft text-mint-ink' : 'bg-card text-text-muted',
            )}
          >
            {groupedView ? 'Ver por día' : 'Agrupar por categoría'}
          </button>
        </div>
      </div>

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
      ) : (
        <div className="rounded-[26px] bg-card px-4 py-0.5">
          {groupedView
            ? props.groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="flex items-center gap-2 pb-0.5 pt-2.5">
                    <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                      {group.label}
                    </h2>
                    <span className="text-[12px] text-text-muted">
                      {`${group.count} ${group.count === 1 ? 'movimiento' : 'movimientos'}`}
                    </span>
                    <AmountDisplay
                      cents={group.direction === 'out' ? -group.totalCents : group.totalCents}
                      signed={group.direction !== 'neutral'}
                      className={cn(
                        'text-[12px] font-semibold',
                        group.direction === 'in' ? 'text-income' : 'text-ink',
                      )}
                    />
                  </div>
                  <ul className="divide-y divide-line">
                    {group.entries.map((entry) => renderEntry(entry, true))}
                  </ul>
                </section>
              ))
            : days.map((day) => (
                <section key={day.date} aria-label={formatLongDay(day.date)}>
                  <div className="flex items-baseline justify-between gap-2 pb-0.5 pt-2.5">
                    <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                      {day.date === today || formatRelativeDay(day.date, today) === 'Ayer'
                        ? formatRelativeDay(day.date, today)
                        : formatLongDay(day.date)}
                    </h2>
                    {day.scheduledCents > 0 && !day.entries.some((e) => isExecuted(e, today)) && (
                      <span className="text-[12px] font-semibold text-text-muted">
                        Programado {formatArs(-day.scheduledCents)}
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-line">
                    {day.entries.map((entry) => renderEntry(entry, false))}
                  </ul>
                </section>
              ))}
        </div>
      )}

      {count > 0 && (
        <p className="text-center text-[12px] text-text-muted">
          Deslizá un movimiento a la derecha para anularlo o a la izquierda para editarlo.
        </p>
      )}

      {detail && (
        <MovementDetail
          transaction={detail}
          category={detailCategory}
          accountName={accountNamesById.get(detail.accountId)}
          history={props.transactions}
          onClose={() => setDetail(null)}
          onEdit={() => {
            const target = detail
            setDetail(null)
            props.onEdit(target)
          }}
          onDelete={() => setPendingVoid({ type: 'transaction', id: detail.id, occurredOn: detail.occurredOn, transaction: detail })}
        />
      )}

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

function FilterChip({
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

/** The face of a row: 38px icon circle, name with its detail line, amount. */
function RowFace({
  icon,
  title,
  subtitle,
  amount,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  amount: ReactNode
}) {
  return (
    <span className="grid grid-cols-[38px_1fr_auto] items-center gap-3 py-2 text-left">
      <span
        aria-hidden="true"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sand text-ink"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        <span className="block truncate text-[12px] text-text-muted">{subtitle}</span>
      </span>
      <span className="whitespace-nowrap text-[15px] font-medium">{amount}</span>
    </span>
  )
}

function TransactionRow({
  transaction,
  category,
  accountName,
  today,
  withDay,
  onOpen,
  onEdit,
  onDelete,
}: {
  transaction: Transaction
  category: Category | undefined
  accountName: string | undefined
  today: IsoDate
  withDay: boolean
  onOpen: () => void
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
  const name = transaction.note?.trim() || categoryName
  const Icon = adjustment ? Scale : getCategoryIcon(category?.icon)
  const day = formatRelativeDay(transaction.occurredOn, today)
  // The category goes in the detail line only when the title is something else (the note).
  const place =
    [name !== categoryName ? categoryName : null, accountName].filter(Boolean).join(' · ') || day
  const subtitle = scheduled
    ? `Programada · cierra el ${day} · ${categoryName}`
    : withDay && place !== day
      ? `${day} · ${place}`
      : place
  return (
    <SwipeRow
      surfaceClassName="bg-card"
      onPress={onOpen}
      pressLabel={`Ver detalle de ${name}`}
      // Swiping right voids (the same confirmation as before); swiping left edits. Both are real buttons too.
      // The starting balance is fixed history: a wrong balance is fixed with "Ajustar saldo".
      leadingAction={
        opening
          ? undefined
          : { label: 'Anular', tone: 'danger', ariaLabel: `Anular ${name}`, onPress: onDelete }
      }
      actions={
        editable
          ? [{ label: 'Editar', tone: 'primary', ariaLabel: `Editar ${name}`, onPress: onEdit }]
          : []
      }
    >
      <RowFace
        icon={<Icon aria-hidden="true" className="size-[17px]" strokeWidth={1.9} />}
        title={installment ? `${name} · ${installment}` : name}
        subtitle={subtitle}
        amount={
          <AmountDisplay
            cents={isIncome ? transaction.amountCents : -transaction.amountCents}
            signed
            className={cn(scheduled ? 'text-text-muted' : isIncome && !adjustment ? 'text-income' : 'text-ink')}
          />
        }
      />
    </SwipeRow>
  )
}

function isExecuted(entry: ActivityEntry, today: IsoDate): boolean {
  return entry.type === 'transfer' || !isScheduled(entry.transaction, today)
}
