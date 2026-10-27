import { ArrowLeftRight, Search } from 'lucide-react'
import { useState } from 'react'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatLongDay, formatRelativeDay } from '@/shared/lib/dates'
import type { Cents } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle, IconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Card } from '@/shared/ui/Card'
import { countEntries, type ActivityDay, type ActivityEntry } from '../domain/activity'
import type { EntryKind, Transaction } from '../domain/transaction'
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

  return (
    <section className="flex flex-col gap-4 px-4 pt-12">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="font-display text-[30px] font-bold leading-[34px]">Actividad</h1>
        <p className="text-[16px] text-text-muted">
          {count} {count === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </div>

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
          className="h-14 w-full rounded-full border border-cream bg-white pl-12 pr-4 text-[17px] text-forest placeholder:text-text-muted"
        />
      </label>

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
      ) : (
        days.map((day) => (
          <section key={day.date} aria-label={formatLongDay(day.date)}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="font-display text-[17px] font-semibold">{formatLongDay(day.date)}</h2>
              <AmountDisplay
                cents={day.netCents}
                className={`font-display text-[17px] font-semibold ${day.netCents < 0 ? 'text-expense' : 'text-income'}`}
              />
            </div>
            <Card className="py-1">
              <ul className="divide-y divide-cream">
                {day.entries.map((entry) => (
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
                        trailing={
                          <AmountDisplay
                            cents={entry.transfer.amountCents}
                            className="text-forest"
                          />
                        }
                        onDelete={() => setPendingVoid(entry)}
                        deleteLabel="Anular transferencia"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}

      {pendingVoid && (
        <ConfirmDialog
          title={
            pendingVoid.type === 'transfer'
              ? '¿Anular esta transferencia?'
              : '¿Anular este movimiento?'
          }
          message={
            voidError ?? 'Lo sacamos de tus balances y totales. Esta acción no se puede deshacer.'
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
  const isIncome = transaction.kind === 'income'
  const categoryName = category?.name ?? 'Sin categoría'
  return (
    <MovementRow
      leading={<CategoryIconCircle iconName={category?.icon} color={category?.color} />}
      title={transaction.note?.trim() || categoryName}
      subtitle={`${formatRelativeDay(transaction.occurredOn, today)} · ${categoryName}`}
      trailing={
        <AmountDisplay
          cents={isIncome ? transaction.amountCents : -transaction.amountCents}
          signed
          className={isIncome ? 'text-income' : 'text-expense'}
        />
      }
      onPress={onEdit}
      pressLabel={`Editar ${transaction.note?.trim() || categoryName}`}
      onDelete={onDelete}
      deleteLabel={`Anular ${transaction.note?.trim() || categoryName}`}
    />
  )
}
