import { Check, X } from 'lucide-react'
import mascot from '@/assets/mascot/expresion_feliz.svg'
import { useState, type FormEvent } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { WHITE_PILL } from '@/shared/ui/mentaStyles'
import { useSubscriptionState } from '../api/useBilling'
import { usePlus, useRedeemPromoCode } from '../api/usePlus'
import {
  formatPlusExpiry,
  PLUS_PAYMENTS_NOTE,
  PLUS_PERKS,
  PLUS_REASON_COPY,
  type PlusGateReason,
} from '../domain/plus'
import { PlusSubscribe } from './PlusSubscribe'

interface PlusSheetProps {
  onClose: () => void
  /** Which capability sent the person here; only changes the copy. */
  reason?: PlusGateReason
}

/**
 * "Pasar a Moni Plus": the upsell shown wherever a Plus capability is gated, and the only place to redeem a promo
 * code. Payments do not exist yet and the copy says so. After a successful redeem it shows the end date.
 */
export function PlusSheet({ onClose, reason = 'generic' }: PlusSheetProps) {
  const plus = usePlus()
  const redeem = useRedeemPromoCode()
  const subscription = useSubscriptionState()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (code.trim() === '' || redeem.isPending) return
    setError(null)
    try {
      await redeem.mutateAsync(code.trim())
      setCode('')
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  const activeUntil = redeem.data ?? (plus.isPlus ? plus.expiresAt : null)
  if (activeUntil) {
    return (
      <BottomSheet title="Moni Plus activo" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p role="status" className="flex items-center gap-2 text-[18px] font-extrabold">
            <Check aria-hidden="true" className="size-5 shrink-0" />
            Activo hasta el {formatPlusExpiry(activeUntil, true)}
          </p>
          <ul className="flex flex-col gap-1 text-[16px] leading-6">
            {PLUS_PERKS.map((perk) => (
              <li key={perk}>· {perk}</li>
            ))}
          </ul>
          {subscription.data !== 'authorized' && (
            <p className="text-[15px] leading-5 text-text-muted">
              Si no te suscribís, cuando termine tu cuenta vuelve a la versión Free sin cargos ni
              renovación automática.
            </p>
          )}
          <PlusSubscribe />
          <Button onClick={onClose}>Listo</Button>
        </div>
      </BottomSheet>
    )
  }

  const copy = PLUS_REASON_COPY[reason]
  return (
    <BottomSheet title={copy.title} variant="screen" bare onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pb-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={cn('flex size-10 items-center justify-center rounded-full bg-card text-ink', FOCUS_RING)}
          >
            <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center gap-3.5">
          <img
            src={mascot}
            alt=""
            className="size-16 shrink-0 rounded-full border-[3px] border-lilac bg-card object-cover shadow-[0_8px_20px_rgba(20,50,30,.3)]"
          />
          <div>
            <p className="font-display text-[24px] font-semibold leading-[1.1] tracking-[-0.03em]">
              Moni Plus
            </p>
            <p className="mt-0.5 text-[14px] text-[#4F6157] dark:text-text-muted">{copy.text}</p>
          </div>
        </div>

        <PlusComparison />
        <PlusSubscribe />

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2.5 rounded-[26px] bg-card p-4">
          <p className="text-[13px] leading-5 text-text-muted">{PLUS_PAYMENTS_NOTE}</p>
          <label htmlFor="plus-code" className="text-[15px] font-bold">
            Código de acceso
          </label>
          <input
            id="plus-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            placeholder="Escribí tu código"
            className={cn('h-12 rounded-[18px] border border-line bg-canvas px-4 text-[16px]', FOCUS_RING)}
          />
          {error && (
            <p role="alert" className="text-center text-sm text-expense">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={code.trim() === '' || redeem.isPending}
            className={cn(WHITE_PILL, 'h-12 bg-sand text-[15px] font-semibold')}
          >
            {redeem.isPending ? 'Canjeando…' : 'Canjear código'}
          </button>
        </form>
        <button
          type="button"
          onClick={onClose}
          className={cn('min-h-11 rounded-full text-[15px] font-semibold text-text-muted', FOCUS_RING)}
        >
          Ahora no
        </button>
      </div>
    </BottomSheet>
  )
}

/** What Free and Plus include. Only things that exist in the app: the gated ones are the Plus perks. */
const COMPARISON: readonly { label: string; free: true | string | null }[] = [
  { label: 'Cargar gastos a mano', free: true },
  { label: 'Disponible diario', free: true },
  { label: 'Grupos propios', free: '1' },
  { label: 'Cargar gastos hablando', free: null },
  { label: 'Escanear tickets con la cámara', free: null },
  { label: 'Preguntale a Moni: “¿me conviene?”', free: null },
  { label: 'Importar pagos de Mercado Pago', free: null },
]

function PlusComparison() {
  const cols = 'grid grid-cols-[1fr_54px_70px] items-center'
  return (
    <div role="table" aria-label="Free y Plus" className="rounded-[28px] bg-card px-4 py-1">
      <div role="row" className={cn(cols, 'border-b border-line py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted')}>
        <span role="columnheader" className="sr-only">
          Función
        </span>
        <span aria-hidden="true" />
        <span role="columnheader" className="text-center">Free</span>
        <span role="columnheader" className="text-center text-mint-ink">Plus</span>
      </div>
      {COMPARISON.map((row, i) => (
        <div
          key={row.label}
          role="row"
          className={cn(cols, 'py-2 text-[14px]', i < COMPARISON.length - 1 && 'border-b border-line')}
        >
          <span role="rowheader">{row.label}</span>
          <span role="cell" className="flex justify-center">
            {row.free === true ? (
              <>
                <Check aria-hidden="true" className="size-[18px] text-[#4F6157] dark:text-text-muted" strokeWidth={2.4} />
                <span className="sr-only">Incluido</span>
              </>
            ) : row.free ? (
              <span className="text-[13px] font-semibold text-text-muted">{row.free}</span>
            ) : (
              <>
                <span aria-hidden="true" className="text-[#B7BDB8]">—</span>
                <span className="sr-only">No incluido</span>
              </>
            )}
          </span>
          <span role="cell" className="flex justify-center">
            <Check aria-hidden="true" className="size-[18px] text-mint-ink" strokeWidth={2.6} />
            <span className="sr-only">Incluido</span>
          </span>
        </div>
      ))}
    </div>
  )
}
