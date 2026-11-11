import { useState } from 'react'
import { Link } from 'react-router'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import {
  availableCredit,
  cardDebtOf,
  isCreditCard,
  type Account,
} from '@/features/accounts/domain/account'
import { useExpectedIncome } from '@/features/dashboard/api/useExpectedIncome'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatDayMonth, formatMonthName, formatMonthShortYear, monthNameOf } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { Panel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useCardOverview } from '../api/useCards'
import { useInstallmentViews } from '../api/useInstallmentViews'
import { useStatementBars } from '../api/useStatementBars'
import { cardCeilingCents, nextStatement, purchaseTip } from '../domain/statementChart'
import { CardSummarySection } from './CardSummarySection'

const BAR_AREA = 88

function cycleText(card: Account, closingOn: string | null | undefined, dueOn: string | null | undefined) {
  if (closingOn && dueOn) return `Cierra ${formatDayMonth(closingOn)} · Vence ${formatDayMonth(dueOn)}`
  if (card.closingDay !== null && card.dueDay !== null)
    return `Cierra el ${card.closingDay} · vence el ${card.dueDay}`
  return 'Sin día de cierre y vencimiento'
}

/** One card of the selector. The active one is mint; each reads its own next closing and due date. */
function CardTab({ card, active, onSelect }: { card: Account; active: boolean; onSelect: () => void }) {
  const overview = useCardOverview(card.id)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col gap-[3px] rounded-[18px] px-[13px] py-[11px] text-left',
        FOCUS_RING,
        active ? 'bg-mint text-white' : 'bg-card text-ink',
      )}
    >
      <span className="truncate text-[15.5px] font-semibold">{card.name}</span>
      <span className={cn('text-[12px]', active ? 'text-[#DDF3E6]' : 'text-text-muted')}>
        {cycleText(card, overview.data?.nextClosingOn, overview.data?.nextDueOn)}
      </span>
    </button>
  )
}

function Bars({ card }: { card: Account }) {
  const overview = useCardOverview(card.id)
  const income = useExpectedIncome()
  const statements = overview.data?.statements ?? []
  const { bars } = useStatementBars(card.id, statements)
  const next = nextStatement(statements)
  const ceiling = cardCeilingCents(income.incomeCents)
  const first = bars[0]
  const max = Math.max(1, ceiling ?? 0, ...bars.map((b) => b.totalCents))
  const over = ceiling !== null && first ? first.totalCents - ceiling : 0
  const tip = purchaseTip(card.closingDay ?? overview.data?.closingDay ?? null, card.dueDay ?? overview.data?.dueDay ?? null, todayIso())
  const monthLabel = (b: (typeof bars)[number]) => formatMonthName(b.dueOn ?? b.closingOn).slice(0, 3)

  return (
    <>
      <section aria-label="Próximo resumen" className="flex flex-col gap-2.5 rounded-[28px] bg-card px-4 pb-3.5 pt-4">
        {next && first ? (
          <>
            <div>
              <Kicker className="font-medium">
                Próximo resumen{next.dueOn ? ` · vence ${formatDayMonth(next.dueOn)}` : ''}
              </Kicker>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <AmountDisplay
                  cents={first.totalCents}
                  className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em]"
                />
                {over > 0 && (
                  <span className="whitespace-nowrap rounded-full bg-warn-bg px-[9px] py-[3px] text-[12px] font-semibold text-warn-ink">
                    +<AmountDisplay cents={over} /> sobre el techo
                  </span>
                )}
              </div>
            </div>
            <div
              role="img"
              aria-label={`Próximos ${bars.length} resúmenes: ${bars
                .map((b) => `${monthLabel(b)} ${formatArs(b.totalCents)}`)
                .join(', ')}`}
              className="relative grid h-24 items-end gap-3.5 px-1.5"
              style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
            >
              {ceiling !== null && (
                <span
                  aria-hidden="true"
                  data-testid="ceiling-line"
                  className="absolute inset-x-0 border-t-[1.5px] border-dashed border-bad-ink"
                  style={{ bottom: `${(ceiling / max) * BAR_AREA}px` }}
                />
              )}
              {bars.map((b) => {
                const height = Math.max(4, Math.round((b.totalCents / max) * BAR_AREA))
                return (
                  <div
                    key={b.closingOn}
                    aria-hidden="true"
                    className="flex flex-col overflow-hidden rounded-xl"
                    style={{ height }}
                  >
                    <span className="bg-[#8FD6AE] dark:bg-mint-ink/50" style={{ flex: `${b.otherCents} 1 0` }} />
                    <span className="bg-mint" style={{ flex: `${b.installmentsCents} 1 0` }} />
                  </div>
                )
              })}
            </div>
            <div
              aria-hidden="true"
              className="grid gap-3.5 px-1.5 text-center text-[11.5px] text-text-muted"
              style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
            >
              {bars.map((b, i) => (
                <span key={b.closingOn} className={cn(i === 0 && 'font-semibold text-ink')}>
                  {monthLabel(b)}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-[#4F6157] dark:text-text-muted">
              <span className="flex items-center gap-[5px]">
                <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-mint" />
                Cuotas
              </span>
              <span className="flex items-center gap-[5px]">
                <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-[#8FD6AE] dark:bg-mint-ink/50" />
                Consumos y fijos
              </span>
              {ceiling !== null && (
                <span className="flex items-center gap-[5px]">
                  <span aria-hidden="true" className="w-3 border-t-[1.5px] border-dashed border-bad-ink" />
                  Techo <AmountDisplay cents={ceiling} /> (20% de ingresos)
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13.5px] text-text-muted">
            {overview.isLoading
              ? 'Cargando tu resumen…'
              : 'No hay resúmenes por pagar. Cuando cargues compras con esta tarjeta, los vas a ver acá.'}
          </p>
        )}
      </section>

      {tip && (
        <p className="rounded-[18px] bg-gold px-3.5 py-2 text-[14px] font-medium text-[#2F3A24] [text-wrap:pretty]">
          Si comprás después del día {tip.day}, entra en el resumen de {monthNameOf(tip.dueOn)}.
        </p>
      )}
    </>
  )
}

function ActiveInstallments() {
  const accounts = useAccounts()
  const { views } = useInstallmentViews()
  if (views.length === 0) return null
  const names = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  return (
    <section aria-label="Cuotas activas" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Cuotas activas</h2>
        <Link to="/cuentas?tab=cuotas" className={cn('text-[13.5px] text-[#4F6157] dark:text-text-muted', FOCUS_RING)}>
          Ver las {views.length} →
        </Link>
      </div>
      <ul className="divide-y divide-line rounded-[26px] bg-card px-4 py-0.5">
        {views.slice(0, 2).map((v) => (
          <li key={v.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-[7px]">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium">{v.description}</div>
              <div className="text-[12px] text-text-muted">
                {names.get(v.accountId) ?? 'Tarjeta'} · cuota {v.paid}/{v.count} · termina{' '}
                {formatMonthShortYear(v.endsOn).split(' de ')[0]}
              </div>
            </div>
            <AmountDisplay cents={v.installmentCents} className="text-[15px] font-medium" />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The "Tarjetas" tab of Medios de pago, as "Lo que viene": card selector, the next statement against the ceiling (20% of
 * the expected income), the statements ahead, the purchase tip and the active installments. Below it, the statement
 * detail of the card (pay what is billed, statements by statement). Editing reuses the Medios de pago sheet (`onEdit`).
 */
export function CardsPanel({
  onEdit,
  onAdd,
}: {
  onEdit: (card: Account) => void
  onAdd: () => void
}) {
  const accounts = useAccounts()
  const { openNew } = useMovementSheet()
  const cards = (accounts.data ?? []).filter(isCreditCard)
  const [selected, setSelected] = useState<string | null>(null)

  if (accounts.isLoading) {
    return (
      <div role="status" aria-label="Cargando tarjetas" className="flex flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <Panel>
        <EmptyState
          mascotUrl={mascotAssistant}
          title="Todavía no tenés tarjetas"
          description="Agregá tu tarjeta de crédito con su límite y sus días de cierre y vencimiento."
          action={<Button onClick={onAdd}>Agregar una tarjeta</Button>}
        />
      </Panel>
    )
  }

  const card = cards.find((c) => c.id === selected) ?? cards[0]
  if (!card) return null
  const credit = availableCredit(card)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[24px] font-semibold tracking-[-0.03em]">Lo que viene</h2>
        <button type="button" onClick={onAdd} className={cn('text-[13px] text-[#4F6157] dark:text-text-muted', FOCUS_RING)}>
          + Agregar tarjeta
        </button>
      </div>

      <div role="group" aria-label="Tarjetas" className="grid grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <CardTab key={c.id} card={c} active={c.id === card.id} onSelect={() => setSelected(c.id)} />
        ))}
      </div>

      <Bars card={card} />

      <ActiveInstallments />

      <Link
        to="/tarjetas/simulador"
        className={cn('flex items-center justify-between rounded-[26px] bg-card px-4 py-3', FOCUS_RING)}
      >
        <span>
          <span className="block text-[15px] font-medium">¿Cuotas o contado?</span>
          <span className="block text-[12px] text-text-muted">Simulá cuál te conviene</span>
        </span>
        <span aria-hidden="true" className="text-[13.5px] text-[#4F6157] dark:text-text-muted">→</span>
      </Link>

      <Panel key={card.id} className="flex flex-col gap-3 rounded-[26px] border-0">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold">{card.name}</span>
            <span className="block text-[13px] leading-5 text-text-muted">
              {card.closingDay !== null && card.dueDay !== null
                ? `Cierra el ${card.closingDay} · vence el ${card.dueDay}`
                : 'Sin día de cierre y vencimiento'}
              {card.creditLimitCents !== null && ` · límite ${formatArs(card.creditLimitCents)}`}
            </span>
          </span>
          <span className="text-right">
            <Kicker as="span" className="block">
              {credit !== null ? 'Disponible' : 'Deuda'}
            </Kicker>
            <AmountDisplay cents={credit !== null ? credit : cardDebtOf(card)} className="text-[17px] font-semibold" />
          </span>
        </div>
        <CardSummarySection
          accountId={card.id}
          onPay={(amountCents) => openNew('transfer', { toAccountId: card.id, amountCents })}
        />
        <button
          type="button"
          onClick={() => onEdit(card)}
          className={cn('min-h-11 self-start text-[14px] font-semibold text-ink underline', FOCUS_RING)}
        >
          Editar la tarjeta
        </button>
      </Panel>
    </div>
  )
}
