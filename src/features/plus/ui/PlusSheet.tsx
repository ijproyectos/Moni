import { Check, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { usePlus, useRedeemPromoCode } from '../api/usePlus'
import {
  formatPlusExpiry,
  PLUS_PAYMENTS_NOTE,
  PLUS_PERKS,
  PLUS_REASON_COPY,
  type PlusGateReason,
} from '../domain/plus'

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
          <p className="text-[15px] leading-5 text-text-muted">
            Cuando termine, tu cuenta vuelve a la versión Free sin cargos ni renovación automática.
          </p>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </BottomSheet>
    )
  }

  const copy = PLUS_REASON_COPY[reason]
  return (
    <BottomSheet title={copy.title} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-[16px] leading-6">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {copy.text}
        </p>
        <ul className="flex flex-col gap-1 text-[16px] leading-6">
          {PLUS_PERKS.map((perk) => (
            <li key={perk}>· {perk}</li>
          ))}
        </ul>
        <p className="rounded-[18px] bg-sand/60 px-4 py-3 text-[15px] leading-5">
          {PLUS_PAYMENTS_NOTE}
        </p>
        <label htmlFor="plus-code" className="text-[15px] font-extrabold">
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
          className="h-14 rounded-[18px] border border-sand bg-card px-4 text-[17px]"
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" disabled={code.trim() === '' || redeem.isPending}>
          {redeem.isPending ? 'Canjeando…' : 'Canjear código'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Ahora no
        </Button>
      </form>
    </BottomSheet>
  )
}
