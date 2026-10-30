import { useRef, useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useCorrectPayment } from '../api/useFixedExpenses'
import type { FixedExpense, Payment } from '../domain/fixedExpense'

/** Fixes the amount or the payment day of a payment Moni registered. The same movement changes: nothing is duplicated. */
export function CorrectPaymentSheet({
  payment,
  expense,
  onClose,
}: {
  payment: Payment
  expense: FixedExpense
  onClose: () => void
}) {
  const toast = useToast()
  const correct = useCorrectPayment()
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const [text, setText] = useState(formatAmountInput(payment.amountCents))
  const [paidOn, setPaidOn] = useState(payment.paidOn)
  const [error, setError] = useState<string | null>(null)
  const amountCents = parseAmountInput(text) ?? 0
  const valid = amountCents > 0 && isIsoDate(paidOn) && paidOn <= today

  async function save() {
    if (!valid || saving.current) return
    saving.current = true
    setError(null)
    try {
      await correct.mutateAsync({ paymentId: payment.id, amountCents, paidOn })
      toast.show('Pago corregido')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  return (
    <BottomSheet title="Corregir pago" subtitle={expense.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <SectionLabel>Importe real pagado</SectionLabel>
          <AmountInput
            aria-label="Importe real"
            prefix="$"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Fecha de pago
          </span>
          <input
            type="date"
            value={paidOn}
            max={today}
            onChange={(e) => setPaidOn(e.target.value)}
            aria-label="Fecha de pago"
            className="h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest"
          />
        </label>
        <p className="text-[14px] leading-5 text-text-muted">
          Cambia el mismo gasto que se registró: no se crea otro y el saldo se ajusta solo por la
          diferencia.
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button disabled={!valid || correct.isPending} onClick={() => void save()}>
          Guardar corrección
        </Button>
      </div>
    </BottomSheet>
  )
}
