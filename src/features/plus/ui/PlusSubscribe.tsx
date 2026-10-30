import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import {
  useReactivateSubscription,
  useStartCheckout,
  useSubscriptionState,
} from '../api/useBilling'
import { PLUS_PRICE_DISPLAY, SUBSCRIBE_LABEL } from '../domain/billing'

/**
 * The Mercado Pago signup block of the Plus sheet ("signup page" of the without-plan-pending contract). It handles
 * every subscription state: none and cancelled offer the subscribe button, pending explains the open payment and lets
 * the person retry, authorized confirms the renewal, paused offers to reactivate. The price shown here is display
 * only: the amount charged is decided by the server.
 */
export function PlusSubscribe() {
  const subscription = useSubscriptionState()
  const checkout = useStartCheckout()
  const reactivate = useReactivateSubscription()
  const [error, setError] = useState<string | null>(null)
  const state = subscription.data

  async function subscribe() {
    if (checkout.isPending || checkout.isSuccess) return
    setError(null)
    try {
      await checkout.mutateAsync()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  async function resume() {
    if (reactivate.isPending) return
    setError(null)
    try {
      await reactivate.mutateAsync()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  // Redirecting counts as busy too: the person must not be able to create a second subscription while leaving.
  const busy = checkout.isPending || checkout.isSuccess
  const showSubscribe = state !== 'authorized' && state !== 'paused'

  return (
    <section
      data-mp-subscriptions-page="without-plan-pending"
      aria-label="Suscripción a Moni Plus"
      className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4"
    >
      <p className="text-[16px] leading-6">
        <strong className="font-extrabold">{PLUS_PRICE_DISPLAY.perMonth}</strong> con Mercado Pago.
        Se renueva cada mes y cancelás cuando quieras.
      </p>

      {subscription.isLoading && (
        <p role="status" className="text-[15px] leading-5 text-text-muted">
          Cargando tu suscripción…
        </p>
      )}
      {state === 'pending' && (
        <p role="status" className="text-[15px] leading-5">
          Tenés un pago sin completar. Si ya pagaste, puede tardar unos minutos en activarse.
        </p>
      )}
      {state === 'authorized' && (
        <p role="status" className="text-[15px] leading-5">
          Tu suscripción está activa y se renueva cada mes. Podés cancelarla desde tu perfil.
        </p>
      )}
      {state === 'paused' && (
        <p role="status" className="text-[15px] leading-5">
          Tu suscripción está pausada y no se cobra. Reactivala para que siga renovándose.
        </p>
      )}
      {state === 'cancelled' && (
        <p role="status" className="text-[15px] leading-5">
          Cancelaste tu suscripción. Podés volver a suscribirte cuando quieras.
        </p>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}

      {showSubscribe && (
        <Button
          data-mp-subscription-cta="without-plan-pending"
          onClick={() => void subscribe()}
          disabled={busy || subscription.isLoading}
        >
          {busy
            ? 'Preparando el pago…'
            : state === 'pending'
              ? `Reintentar · ${PLUS_PRICE_DISPLAY.perMonth}`
              : SUBSCRIBE_LABEL}
        </Button>
      )}
      {state === 'paused' && (
        <Button variant="dark" onClick={() => void resume()} disabled={reactivate.isPending}>
          {reactivate.isPending ? 'Reactivando…' : 'Reactivar suscripción'}
        </Button>
      )}
    </section>
  )
}
