import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MINT_PILL, WHITE_PILL } from '@/shared/ui/mentaStyles'
import { isPurchaseCancelled } from '../api/revenueCat'
import {
  useConfigureRevenueCat,
  useNativeEntitlement,
  usePurchaseNativePlus,
  useRestoreNativePurchases,
} from '../api/useNativePlus'
import { PLUS_PRICE_DISPLAY, SUBSCRIBE_LABEL } from '../domain/billing'

/**
 * The StoreKit / Play Billing signup block of the Plus sheet, shown instead of PlusSubscribe's Mercado Pago flow
 * inside the native app (see PlusSubscribe.tsx for the Capacitor.isNativePlatform() branch). The price shown here
 * is display only: the real price and currency are whatever the store shows at purchase time.
 */
export function PlusSubscribeNative() {
  useConfigureRevenueCat()
  const entitlement = useNativeEntitlement()
  const purchase = usePurchaseNativePlus()
  const restore = useRestoreNativePurchases()
  const [error, setError] = useState<string | null>(null)

  async function subscribe() {
    if (purchase.isPending) return
    setError(null)
    try {
      await purchase.mutateAsync()
    } catch (e) {
      if (!isPurchaseCancelled(e)) setError(toUserMessage(e))
    }
  }

  async function restorePurchases() {
    if (restore.isPending) return
    setError(null)
    try {
      await restore.mutateAsync()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  const [price = '', unit = ''] = PLUS_PRICE_DISPLAY.perMonth.split('/')
  const managementUrl = entitlement.data?.managementUrl ?? null

  return (
    <section aria-label="Suscripción a Moni Plus" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 rounded-[18px] bg-card px-3.5 py-3 shadow-[inset_0_0_0_2px_var(--color-mint-ink)]">
        <span className="text-[13px] font-semibold text-mint-ink">Mensual</span>
        <span className="text-[19px] font-semibold tracking-[-0.02em]">
          {price}
          <span className="text-[13px] font-normal text-text-muted"> /{unit}</span>
        </span>
        <span className="text-[12.5px] text-text-muted">
          Se renueva cada mes a través de la tienda (App Store o Google Play).
        </span>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}

      {!entitlement.data?.isActive && (
        <>
          <button
            type="button"
            aria-label={purchase.isPending ? undefined : SUBSCRIBE_LABEL}
            onClick={() => void subscribe()}
            disabled={purchase.isPending}
            className={cn(MINT_PILL, 'h-[54px] text-[16px] font-semibold')}
          >
            {purchase.isPending ? 'Procesando…' : 'Suscribirme'}
          </button>
          <button
            type="button"
            onClick={() => void restorePurchases()}
            disabled={restore.isPending}
            className={cn(WHITE_PILL, 'h-11 text-[14px] font-semibold', FOCUS_RING)}
          >
            {restore.isPending ? 'Restaurando…' : 'Ya pagué, restaurar compras'}
          </button>
        </>
      )}

      {entitlement.data?.isActive && managementUrl && (
        <a
          href={managementUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            WHITE_PILL,
            'flex h-[54px] items-center justify-center text-[16px] font-semibold',
            FOCUS_RING,
          )}
        >
          Gestionar suscripción
        </a>
      )}
    </section>
  )
}
