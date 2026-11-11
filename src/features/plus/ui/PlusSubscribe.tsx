import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MINT_PILL, WHITE_PILL } from '@/shared/ui/mentaStyles'
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

  const [price = '', unit = ''] = PLUS_PRICE_DISPLAY.perMonth.split('/')

  return (
    <section
      data-mp-subscriptions-page="without-plan-pending"
      aria-label="Suscripción a Moni Plus"
      className="flex flex-col gap-3"
    >
      {/* The plan card: only the real monthly plan; the amount charged is decided by the server. */}
      <div className="flex flex-col gap-0.5 rounded-[18px] bg-card px-3.5 py-3 shadow-[inset_0_0_0_2px_var(--color-mint-ink)]">
        <span className="text-[13px] font-semibold text-mint-ink">Mensual</span>
        <span className="text-[19px] font-semibold tracking-[-0.02em]">
          {price}
          <span className="text-[13px] font-normal text-text-muted"> /{unit}</span>
        </span>
        <span className="text-[12.5px] text-text-muted">Se renueva cada mes con Mercado Pago.</span>
      </div>

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
        <>
          {/* The accessible name stays the billing label (it carries the price); the visible copy is the design's. */}
          <button
            type="button"
            data-mp-subscription-cta="without-plan-pending"
            aria-label={
              busy
                ? undefined
                : state === 'pending'
                  ? `Reintentar · ${PLUS_PRICE_DISPLAY.perMonth}`
                  : SUBSCRIBE_LABEL
            }
            onClick={() => void subscribe()}
            disabled={busy || subscription.isLoading}
            className={cn(MINT_PILL, 'h-[54px] text-[16px] font-semibold')}
          >
            {busy
              ? 'Preparando el pago…'
              : state === 'pending'
                ? 'Reintentar con Mercado Pago'
                : 'Suscribirme con Mercado Pago'}
          </button>
          <p className="text-center text-[12.5px] text-text-muted">
            Cancelás cuando quieras desde Perfil.
          </p>
        </>
      )}
      {state === 'paused' && (
        <button
          type="button"
          onClick={() => void resume()}
          disabled={reactivate.isPending}
          className={cn(WHITE_PILL, 'h-[54px] text-[16px] font-semibold', FOCUS_RING)}
        >
          {reactivate.isPending ? 'Reactivando…' : 'Reactivar suscripción'}
        </button>
      )}
    </section>
  )
}
