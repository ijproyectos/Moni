import { Link } from 'react-router'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { addsToBalance, groupKindLabel, isAdjustment, isOpening } from '@/features/transactions/domain/transaction'
import { formatLongDate, formatLongDay, formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { RecentMovement } from '../domain/monthSummary'
import { groupMovementsByDay } from '../domain/recentMovements'
import { SwipeRow } from '@/shared/ui/SwipeRow'

/** What can be done with a movement from Inicio; the page decides it from the real transaction. */
export interface MovementActions {
  canEdit: (movement: RecentMovement) => boolean
  canVoid: (movement: RecentMovement) => boolean
  /** The movement is an installment: voiding it cancels the whole purchase. */
  isInstallment: (movement: RecentMovement) => boolean
  onEdit: (movement: RecentMovement) => void
  /** Rejects with a message fit for the person to read. */
  onVoid: (movement: RecentMovement) => Promise<void>
}

function titleOf(m: RecentMovement): string {
  if (isOpening(m.kind)) return 'Saldo inicial'
  if (isAdjustment(m.kind)) return 'Ajuste de saldo'
  if (!m.note?.trim() && groupKindLabel(m.kind)) return groupKindLabel(m.kind) ?? 'Movimiento'
  return m.note?.trim() || m.categoryName || 'Movimiento'
}

function subtitleOf(m: RecentMovement): string {
  if (isOpening(m.kind) || isAdjustment(m.kind)) return m.accountName
  const groupLabel = groupKindLabel(m.kind)
  if (groupLabel) return [groupLabel, m.groupName, m.accountName].filter(Boolean).join(' · ')
  return `${m.categoryName ?? 'Sin categoría'} · ${m.accountName}`
}

/** How many movements Inicio lists before "Ver más movimientos". */
const COLLAPSED_COUNT = 5

/** "Hoy, 5 de noviembre", "Ayer, 4 de noviembre" or "1 de noviembre" (with the year when it is not this one). */
function dayHeading(date: string, today: string): string {
  const day = formatLongDate(date).replace(/ de \d{4}$/, '')
  const label = formatRelativeDay(date, today)
  const withYear = date.slice(0, 4) === today.slice(0, 4) ? day : formatLongDate(date)
  return label === 'Hoy' || label === 'Ayer' ? `${label}, ${day}` : withYear
}

/** "Movimientos": the newest ones by day, as plain rows. Swiping a row right reveals void, left reveals edit. */
export function RecentMovements({
  movements,
  total,
  actions,
  today = todayIso(),
  variant = 'list',
}: {
  movements: readonly RecentMovement[]
  /** How many movements there are in all (the link to Actividad says it). */
  total?: number
  actions?: MovementActions
  /** Today, to say "Hoy" and "Ayer" on the day headings (a prop so it can be tested). */
  today?: string
  /** `latest` is Hoy: the two newest movements, in a card. `list` is the full grouped list. */
  variant?: 'list' | 'latest'
}) {
  const [pending, setPending] = useState<RecentMovement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const latest = variant === 'latest'
  const shown = latest ? movements.slice(0, 2) : expanded ? movements : movements.slice(0, COLLAPSED_COUNT)
  const canExpand = !latest && movements.length > COLLAPSED_COUNT
  const days = groupMovementsByDay(shown)
  const anySwipe = !latest && actions ? movements.some((m) => actions.canEdit(m) || actions.canVoid(m)) : false

  async function confirmVoid() {
    if (!pending || !actions) return
    setBusy(true)
    setError(null)
    try {
      await actions.onVoid(pending)
      setPending(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos anular el movimiento.')
    } finally {
      setBusy(false)
    }
  }

  if (latest) {
    return (
      <section aria-labelledby="recent-title" className="mx-[18px] flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 id="recent-title" className="font-display text-[clamp(18px,5.6vw,22px)] font-extrabold tracking-[-0.02em] text-[#0B3D2E] dark:text-ink">
            Últimos movimientos
          </h2>
          <Link
            to="/actividad"
            className="flex min-h-11 shrink-0 items-center whitespace-nowrap text-[clamp(14px,4vw,16px)] font-bold text-[#566A5C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:text-text-muted"
          >
            Ver todos →
          </Link>
        </div>
        <ul className="divide-y divide-[#DCD8BF] overflow-hidden rounded-[28px] border border-[#DCD8BF] bg-[#FAF8EC] dark:divide-line dark:border-line dark:bg-card">
          {shown.map((m) => {
            const edit = actions?.canEdit(m) ? () => actions.onEdit(m) : undefined
            const isIncome = addsToBalance(m.kind)
            const Icon = isIncome ? ArrowDownLeft : ArrowUpRight
            const when = formatRelativeDay(m.occurredOn, today).toLowerCase()
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={edit}
                  disabled={!edit}
                  aria-label={edit ? `Editar ${titleOf(m)}` : undefined}
                  className="grid min-h-[84px] w-full grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 min-[380px]:grid-cols-[48px_1fr_auto] min-[380px]:gap-4 min-[380px]:px-5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B3D2E]"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-11 items-center justify-center rounded-full min-[380px]:size-12 ${isIncome ? 'bg-[#D9E6D6] text-[#1B7F4E]' : 'bg-[#EEDDD3] text-[#B5382A]'}`}
                  >
                    <Icon className="size-5" strokeWidth={2.6} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[clamp(17px,5vw,20px)] font-extrabold leading-tight text-[#0B3D2E] dark:text-ink">{titleOf(m)}</span>
                    <span className="block truncate text-[clamp(13px,3.9vw,16px)] text-[#566A5C] dark:text-text-muted">
                      {subtitleOf(m)} · {when}
                    </span>
                  </span>
                  <AmountDisplay
                    cents={isIncome ? m.amountCents : -m.amountCents}
                    signed
                    className={`text-[clamp(17px,5vw,20px)] font-extrabold ${isIncome ? 'text-[#1B7F4E] dark:text-income' : 'text-[#B5382A] dark:text-expense'}`}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <section aria-labelledby="recent-title" className="py-3">
      <div className="mb-1 flex items-baseline justify-between px-[18px]">
        <h2 id="recent-title" className="font-display text-[17px] font-bold tracking-[-0.02em]">
          Movimientos
        </h2>
        <Link to="/actividad" className="flex min-h-11 items-center text-[15px] text-text-muted">
          {total ? `Ver los ${total}` : 'Ver todos'}
        </Link>
      </div>
      {days.map((day) => {
        return (
          <section key={day.date} aria-label={formatLongDay(day.date)}>
            <h3 className="px-5 pb-1 pt-2 text-[14px] font-semibold text-text-muted">
              {dayHeading(day.date, today)}
            </h3>
            <ul className="divide-y divide-line border-b border-line">
              {day.movements.map((m) => {
                const isIncome = addsToBalance(m.kind)
                const canEdit = actions?.canEdit(m) ?? false
                const canVoid = actions?.canVoid(m) ?? false
                const row = (
                  <div className="flex min-h-[60px] items-center gap-3 px-5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold leading-5 text-ink">
                        {titleOf(m)}
                      </span>
                      <span className="block truncate text-[13px] leading-[18px] text-text-muted">
                        {subtitleOf(m)}
                      </span>
                    </span>
                    <AmountDisplay
                      cents={isIncome ? m.amountCents : -m.amountCents}
                      signed
                      className={
                        isAdjustment(m.kind) || isOpening(m.kind)
                          ? 'text-[16px] font-bold text-ink'
                          : `text-[16px] font-bold ${isIncome ? 'text-income' : 'text-expense'}`
                      }
                    />
                  </div>
                )
                return (
                  <li key={m.id}>
                    {actions && (canEdit || canVoid) ? (
                      <SwipeRow
                        onPress={canEdit ? () => actions.onEdit(m) : undefined}
                        // Swiping right voids (with its confirmation); swiping left edits. Both are real buttons too.
                        leadingAction={
                          canVoid
                            ? {
                                label: 'Anular',
                                tone: 'danger' as const,
                                ariaLabel: `Anular ${titleOf(m)}`,
                                onPress: () => setPending(m),
                              }
                            : undefined
                        }
                        actions={
                          canEdit
                            ? [
                                {
                                  label: 'Editar',
                                  tone: 'primary' as const,
                                  ariaLabel: `Editar ${titleOf(m)}`,
                                  onPress: () => actions.onEdit(m),
                                },
                              ]
                            : []
                        }
                      >
                        {row}
                      </SwipeRow>
                    ) : (
                      row
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mx-auto mt-2 flex min-h-11 items-center px-4 text-[15px] font-semibold text-text-muted"
        >
          {expanded ? 'Ver menos' : 'Ver más movimientos'}
        </button>
      )}
      {anySwipe && (
        <p className="px-5 pt-2 text-center text-[13px] text-text-muted">
          Deslizá un movimiento a la derecha para anularlo o a la izquierda para editarlo.
        </p>
      )}
      {pending && actions && (
        <ConfirmDialog
          title={
            actions.isInstallment(pending)
              ? '¿Anular la compra en cuotas?'
              : '¿Anular este movimiento?'
          }
          message={
            error ??
            (actions.isInstallment(pending)
              ? 'Se anulan todas las cuotas de esta compra, también las que todavía no llegaron, y baja tu deuda. Esta acción no se puede deshacer.'
              : 'Lo sacamos de tus balances y totales. Esta acción no se puede deshacer.')
          }
          confirmLabel="Anular"
          isBusy={busy}
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            setPending(null)
            setError(null)
          }}
        />
      )}
    </section>
  )
}
