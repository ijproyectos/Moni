import { ArrowLeftRight, CalendarDays, List, Scale, Search } from 'lucide-react'
import { useState } from 'react'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatLongDay, formatRelativeDay } from '@/shared/lib/dates'
import type { Cents } from '@/shared/lib/money'
import { formatArs } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle, IconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Card } from '@/shared/ui/Card'
import {
  countEntries,
  type ActivityDay,
  type ActivityEntry,
  type CategoryGroup,
} from '../domain/activity'
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
import { ActivityCalendar } from './ActivityCalendar'

type KindFilter = 'all' | EntryKind

interface ActivityScreenProps {
  month: IsoDate
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
  /** True when the month has no movements at all (distinct from "filters match nothing"). */
  monthIsEmpty: boolean
  onEdit: (transaction: Transaction) => void
  /** Voids a movement or transfer; rejects with a user-safe message on failure. */
  onVoid: (entry: ActivityEntry) => Promise<void>
}

const KIND_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
] as const

const VIEW_OPTIONS = [
  { value: 'list', label: 'Ver por categoría', icon: List },
  { value: 'calendar', label: 'Ver calendario', icon: CalendarDays },
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
  const today = todayIso()
  const count = countEntries(days)
  const chipCategories = kind === 'all' ? categories : categories.filter((c) => c.kind === kind)

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
            leading={<IconCircle icon={ArrowLeftRight} color="#064735" />}
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
    <section className="flex flex-col gap-4 px-4 pt-14">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="font-display text-[34px] font-extrabold leading-[40px]">Actividad</h1>
        <p className="text-[16px] text-text-muted">{`${count} ${countLabel(kind, count)}`}</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
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
            className="h-14 w-full rounded-full border border-sand bg-card pl-12 pr-4 text-[17px] text-ink placeholder:text-text-muted"
          />
        </label>
        <div
          role="group"
          aria-label="Vista de actividad"
          className="flex h-14 shrink-0 items-center gap-1 rounded-full border border-sand bg-card p-1"
        >
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = props.view === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => props.onViewChange(value)}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full',
                  active ? 'bg-forest text-lime' : 'text-text-muted',
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </div>

      <SegmentedControl
        label="Tipo de movimiento"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(value) => {
          props.onKindChange(value)
          props.onCategoryChange(null)
        }}
      />

      {chipCategories.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por categoría"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
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
              icon={getCategoryIcon(c.icon)}
              color={c.color}
              selected={props.categoryId === c.id}
              onClick={() => props.onCategoryChange(props.categoryId === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}

      <ActivityCalendar
        month={props.month}
        days={props.calendarDays}
        expenseCents={props.totals.expenseCents}
        incomeCents={props.totals.incomeCents}
        selectedDay={props.selectedDay}
        canGoNext={props.canGoNext}
        onPrev={props.onPrevMonth}
        onNext={props.onNextMonth}
        onSelectDay={props.onSelectDay}
        showDays={props.view === 'calendar'}
        kind={kind}
        incomeCount={days.reduce(
          (n, d) =>
            n +
            d.entries.filter((e) => e.type === 'transaction' && e.transaction.kind === 'income')
              .length,
          0,
        )}
      />

      {count === 0 ? (
        <EmptyState
          mascotUrl={mascotAnalyst}
          title={props.monthIsEmpty ? 'Todavía no hay movimientos' : 'No encontramos movimientos'}
          description={
            props.monthIsEmpty
              ? 'Cuando cargues gastos o ingresos de este mes, los ves acá.'
              : 'Probá con otra búsqueda o sacá algún filtro.'
          }
        />
      ) : props.view === 'list' ? (
        props.groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="mb-2 flex items-center gap-3 px-1">
              <GroupIcon group={group} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[17px] font-extrabold">{group.label}</h2>
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
            <Card className="rounded-[24px] border-sand py-1">
              <ul className="divide-y divide-sand">{group.entries.map(renderEntry)}</ul>
            </Card>
          </section>
        ))
      ) : (
        days.map((day) => (
          <section key={day.date} aria-label={formatLongDay(day.date)}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="font-display text-[17px] font-extrabold">{formatLongDay(day.date)}</h2>
              {day.scheduledCents > 0 && !day.entries.some((e) => isExecuted(e, today)) ? (
                <span className="font-display text-[15px] font-extrabold text-text-muted">
                  Programado {formatArs(-day.scheduledCents)}
                </span>
              ) : (
                <AmountDisplay
                  cents={day.netCents}
                  signed
                  className={`font-display text-[17px] font-extrabold ${day.netCents < 0 ? 'text-ink' : 'text-income'}`}
                />
              )}
            </div>
            <Card className="rounded-[24px] border-sand py-1">
              <ul className="divide-y divide-sand">{day.entries.map(renderEntry)}</ul>
            </Card>
          </section>
        ))
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

function GroupIcon({ group }: { group: CategoryGroup }) {
  if (group.type === 'category')
    return <CategoryIconCircle iconName={group.category?.icon} color={group.category?.color} />
  if (group.type === 'transfer') return <IconCircle icon={ArrowLeftRight} color="#064735" />
  if (group.type === 'uncategorized') return <CategoryIconCircle iconName={null} />
  return <IconCircle icon={Scale} color="#064735" />
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
          <IconCircle icon={Scale} color="#064735" />
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
