import { useState } from 'react'
import { formatCompactDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useSetSubscriptionStatus } from '../api/useSubscriptions'
import { chargesOf, type Subscription, type SubscriptionCharge } from '../domain/subscription'
import { ChargeRow } from './ChargeRow'
import { ServiceLogo } from './ServiceLogo'

const STATUS_LABEL = { active: 'Activa', paused: 'Pausada', cancelled: 'Cancelada' } as const

/** Detail of one subscription: what it costs, when it charges next, its history and the way to pause, cancel or edit. */
export function SubscriptionDetailSheet({
  subscription,
  charges,
  today,
  busy,
  onEdit,
  onNotCharged,
  onLink,
  onDismiss,
  onClose,
}: {
  subscription: Subscription
  charges: readonly SubscriptionCharge[]
  today: string
  busy?: boolean
  onEdit: () => void
  onNotCharged: (charge: SubscriptionCharge) => void
  onLink: (charge: SubscriptionCharge) => void
  onDismiss: (charge: SubscriptionCharge) => void
  onClose: () => void
}) {
  const toast = useToast()
  const setStatus = useSetSubscriptionStatus()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const own = chargesOf(charges, subscription.id)
  const s = subscription

  async function change(status: 'active' | 'paused' | 'cancelled', done: string) {
    try {
      await setStatus.mutateAsync({ id: s.id, status })
      toast.show(done)
      setConfirmCancel(false)
      if (status !== 'active') onClose()
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setConfirmCancel(false)
    }
  }

  return (
    <BottomSheet title={s.name} subtitle={STATUS_LABEL[s.status]} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <ServiceLogo serviceId={s.serviceId} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[26px] font-extrabold leading-8">
              {formatArs(s.amountCents)}
            </span>
            <span className="block text-[15px] leading-5 text-text-muted">
              {s.period === 'yearly' ? 'por año' : 'por mes'}
              {s.plan ? ` · ${s.plan}` : ''} · {s.accountName}
            </span>
          </span>
        </div>

        {s.status === 'active' && (
          <p className="text-[16px] leading-6">
            Próximo cobro:{' '}
            <strong className="font-extrabold">{formatCompactDate(s.nextChargeOn)}</strong>
          </p>
        )}
        {s.status === 'paused' && (
          <p className="text-[15px] leading-5 text-text-muted">
            Pausada: Moni no registra cobros ni avisos. Al reactivarla sigue desde el próximo cobro,
            sin cargar lo que pasó mientras tanto.
          </p>
        )}
        {s.status === 'cancelled' && (
          <p className="text-[15px] leading-5 text-text-muted">
            Cancelada en Moni: no se registran cobros ni avisos. Tu historial se conserva.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {s.status === 'active' && (
            <>
              <Button variant="dark" onClick={onEdit}>
                Editar
              </Button>
              <Button
                variant="ghost"
                className="text-forest"
                disabled={setStatus.isPending}
                onClick={() => void change('paused', `${s.name} pausada`)}
              >
                Pausar
              </Button>
            </>
          )}
          {s.status === 'paused' && (
            <>
              <Button
                variant="dark"
                disabled={setStatus.isPending}
                onClick={() => void change('active', `${s.name} reactivada`)}
              >
                Reactivar
              </Button>
              <Button variant="ghost" className="text-forest" onClick={onEdit}>
                Editar
              </Button>
            </>
          )}
          {s.status === 'cancelled' && (
            <Button
              variant="dark"
              disabled={setStatus.isPending}
              onClick={() => void change('active', `${s.name} reactivada`)}
            >
              Reactivar
            </Button>
          )}
          {s.status !== 'cancelled' && (
            <Button variant="ghost" className="text-expense" onClick={() => setConfirmCancel(true)}>
              Cancelar en Moni
            </Button>
          )}
        </div>

        <SectionLabel>Historial de pagos</SectionLabel>
        {own.length === 0 ? (
          <p className="text-[15px] text-text-muted">Todavía no hay cobros registrados.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-sand">
            {own.map((c) => (
              <ChargeRow
                key={c.id}
                charge={c}
                subscription={s}
                today={today}
                busy={busy}
                showRevert
                onNotCharged={onNotCharged}
                onLink={onLink}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title={`¿Cancelar ${s.name} en Moni?`}
          message="Moni deja de registrar los cobros y los avisos. Tu historial se conserva. Esto no cancela la suscripción real: eso lo hacés en el servicio."
          confirmLabel="Cancelar en Moni"
          cancelLabel="Volver"
          isBusy={setStatus.isPending}
          onConfirm={() => void change('cancelled', `${s.name} cancelada en Moni`)}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </BottomSheet>
  )
}
