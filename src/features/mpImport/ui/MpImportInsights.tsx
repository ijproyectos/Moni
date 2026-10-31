import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import type { MpDuplicate, MpSubscriptionSuggestion } from '../domain/mpImport'

/** "2026-05-10" -> "10/05". */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

interface MpDuplicatesProps {
  items: readonly MpDuplicate[]
  offline: boolean
  onDismiss: (paymentId: string) => void
}

/** Imports that look like a manual expense already loaded (same medio and amount, within 3 days). */
export function MpDuplicates({ items, offline, onDismiss }: MpDuplicatesProps) {
  if (items.length === 0) return null
  return (
    <Card className="flex flex-col gap-3" aria-label="Posibles duplicados">
      <h3 className="font-display text-[18px] font-extrabold leading-6 text-ink">
        Posibles duplicados
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((d) => (
          <li key={d.paymentId} className="flex flex-col gap-2 text-[15px] leading-5">
            <p>
              Importamos {formatArs(d.cents)} el {shortDate(d.occurredOn)} y ya tenías uno igual el{' '}
              {shortDate(d.duplicateOccurredOn)}. Revisalos en tus movimientos.
            </p>
            <Button
              variant="ghost"
              disabled={offline}
              onClick={() => onDismiss(d.paymentId)}
              className="self-start text-ink"
            >
              No es duplicado
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Recurring payments that matched a subscription: not loaded as expenses (display only, nothing is changed). */
export function MpSuggestions({ items }: { items: readonly MpSubscriptionSuggestion[] }) {
  if (items.length === 0) return null
  return (
    <Card className="flex flex-col gap-3" aria-label="Pagos de suscripciones">
      <h3 className="font-display text-[18px] font-extrabold leading-6 text-ink">
        Pagos de suscripciones
      </h3>
      <ul className="flex flex-col gap-2 text-[15px] leading-5">
        {items.map((s) => (
          <li key={s.paymentId}>
            {formatArs(s.cents)} el {shortDate(s.occurredOn)}
            {s.merchant ? ` en ${s.merchant}` : ''}:{' '}
            {s.subscriptionName
              ? `parece el cobro de tu suscripción ${s.subscriptionName}`
              : 'parece el cobro de una de tus suscripciones'}
            , por eso no lo cargamos como gasto.
          </li>
        ))}
      </ul>
    </Card>
  )
}
