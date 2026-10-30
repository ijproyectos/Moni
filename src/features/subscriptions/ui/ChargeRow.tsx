import { AlertTriangle } from 'lucide-react'
import { formatCompactDate, formatDayMonth } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { addDays } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import {
  isEffectiveCharge,
  type Subscription,
  type SubscriptionCharge,
} from '../domain/subscription'
import { ServiceLogo } from './ServiceLogo'

const FAILURES: Record<string, string> = {
  account_unavailable: 'No se registró: la cuenta ya no está disponible.',
  category_unavailable: 'No se registró: la categoría ya no está disponible.',
}

/** Past charges the person can still say "no se cobró" about. */
const REVERT_WINDOW_DAYS = 60

/**
 * One charge in the history: logo, name, date and amount, what became of it, and the warnings that need a
 * decision (negative balance, possible duplicate). Nothing is linked or voided without a tap.
 */
export function ChargeRow({
  charge,
  subscription,
  today,
  busy,
  showRevert = false,
  onOpenDetail,
  onNotCharged,
  onLink,
  onDismiss,
}: {
  charge: SubscriptionCharge
  subscription: Subscription
  today: string
  busy?: boolean
  /** The "Anular cobro" action lives in the detail of the subscription, never in the lists. */
  showRevert?: boolean
  /** Opens the subscription's detail (where a charge can be voided). */
  onOpenDetail?: (charge: SubscriptionCharge) => void
  onNotCharged: (charge: SubscriptionCharge) => void
  onLink: (charge: SubscriptionCharge) => void
  onDismiss: (charge: SubscriptionCharge) => void
}) {
  const effective = isEffectiveCharge(charge)
  const status = charge.voidedElsewhere
    ? 'Sin cobro'
    : charge.status === 'not_charged'
      ? 'Sin cobro'
      : charge.status === 'linked'
        ? 'Ya estaba cargado por vos'
        : charge.status === 'failed'
          ? 'No se pudo registrar'
          : 'Cobrado'
  const duplicate = effective ? charge.possibleDuplicate : null
  const canRevert = showRevert && effective && charge.dueOn >= addDays(today, -REVERT_WINDOW_DAYS)

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <ServiceLogo serviceId={subscription.serviceId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-extrabold">{subscription.name}</span>
          <span className="block text-[14px] leading-5 text-text-muted">
            {formatCompactDate(charge.dueOn)} · {subscription.accountName}
          </span>
        </span>
        <span className="text-right">
          <span
            className={cn(
              'block text-[17px] font-extrabold',
              !effective && 'text-text-muted line-through',
            )}
          >
            {formatArs(charge.amountCents)}
          </span>
          <span className="block text-[13px] text-text-muted">{status}</span>
        </span>
      </div>

      {charge.status === 'failed' && (
        <p className="text-[14px] leading-5 text-expense">
          {FAILURES[charge.failureReason ?? ''] ?? 'No se pudo registrar este cobro.'}
        </p>
      )}

      {effective && charge.negativeBalance && (
        <div
          role="alert"
          className="flex gap-2 rounded-[14px] bg-blush/60 p-3 text-[14px] leading-5"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-expense" />
          <span>
            Este cobro dejó {subscription.accountName} en saldo negativo
            {charge.balanceAfterCents !== null && ` (${formatArs(charge.balanceAfterCents)})`}. Si
            en realidad no se cobró, abrí la suscripción y anulá el cobro.
          </span>
        </div>
      )}

      {effective && charge.overLimit && (
        <div
          role="alert"
          className="flex gap-2 rounded-[14px] bg-blush/60 p-3 text-[14px] leading-5"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-expense" />
          <span>
            Con este cobro la deuda de {subscription.accountName} superó su límite de crédito. Si en
            realidad no se cobró, abrí la suscripción y anulá el cobro.
          </span>
        </div>
      )}

      {duplicate && (
        <div role="alert" className="flex flex-col gap-2 rounded-[14px] bg-gold/30 p-3">
          <p className="text-[14px] leading-5">
            <strong className="font-extrabold">Posible duplicado:</strong> ya tenías un gasto de{' '}
            {formatArs(duplicate.amountCents)} el {formatDayMonth(duplicate.occurredOn)}
            {duplicate.note ? ` («${duplicate.note}»)` : ''}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="dark"
              disabled={busy}
              onClick={() => onLink(charge)}
              aria-label={`Ya lo cargué, ${subscription.name}`}
            >
              Ya lo cargué
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => onDismiss(charge)}
              aria-label={`No es duplicado, ${subscription.name}`}
              className="text-ink"
            >
              No es duplicado
            </Button>
          </div>
        </div>
      )}

      {!showRevert && onOpenDetail && effective && (charge.negativeBalance || charge.overLimit) && (
        <button
          type="button"
          onClick={() => onOpenDetail(charge)}
          aria-label={`Ver ${subscription.name}`}
          className="self-start text-[14px] font-extrabold text-ink underline"
        >
          Ver suscripción
        </button>
      )}

      {canRevert && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onNotCharged(charge)}
          aria-label={`Anular cobro ${subscription.name} del ${formatCompactDate(charge.dueOn)}`}
          className="self-start text-[14px] font-extrabold text-expense underline disabled:opacity-50"
        >
          Anular cobro
        </button>
      )}
    </li>
  )
}
