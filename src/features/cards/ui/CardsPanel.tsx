import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import {
  availableCredit,
  cardDebtOf,
  isCreditCard,
  type Account,
} from '@/features/accounts/domain/account'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Panel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { CardSummarySection } from './CardSummarySection'

/**
 * The "Tarjetas" tab of Medios de pago: each credit card with its limit, closing and due days, available
 * credit and statements. Editing the card itself reuses the Medios de pago sheet (`onEdit`).
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

  return (
    <>
      {cards.map((card) => {
        const credit = availableCredit(card)
        return (
          <Panel key={card.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-display text-[22px] font-extrabold leading-7">
                  {card.name}
                </span>
                <span className="block text-[14px] leading-5 text-text-muted">
                  {card.closingDay !== null && card.dueDay !== null
                    ? `Cierra el ${card.closingDay} · vence el ${card.dueDay}`
                    : 'Sin día de cierre y vencimiento'}
                  {card.creditLimitCents !== null &&
                    ` · límite ${formatArs(card.creditLimitCents)}`}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                  {credit !== null ? 'Disponible' : 'Deuda'}
                </span>
                <span className="block text-[18px] font-extrabold">
                  {formatArs(credit !== null ? credit : cardDebtOf(card))}
                </span>
              </span>
            </div>
            <CardSummarySection
              accountId={card.id}
              onPay={(amountCents) => openNew('transfer', { toAccountId: card.id, amountCents })}
            />
            <button
              type="button"
              onClick={() => onEdit(card)}
              className="min-h-11 self-start text-[14px] font-extrabold text-ink underline"
            >
              Editar la tarjeta
            </button>
          </Panel>
        )
      })}
    </>
  )
}
