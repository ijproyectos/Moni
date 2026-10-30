import { useRef, useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniSays, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useAddDeposit, useWithdrawReserve } from '../api/useSavings'
import type { SavingsAccount, SavingsGoal } from '../domain/savings'

/**
 * Add money to a goal or take it out. Both are reservations on paper: the account keeps its real balance and
 * nothing is spent, so neither shows up as an expense or an income. A deposit cannot exceed what is free in the
 * account; if it does, the free amount is shown and can be used with one tap.
 */
export function GoalMoneySheet({
  goal,
  account,
  mode,
  onClose,
}: {
  goal: SavingsGoal
  account: SavingsAccount | undefined
  mode: 'deposit' | 'withdraw'
  onClose: () => void
}) {
  const toast = useToast()
  const addDeposit = useAddDeposit()
  const withdraw = useWithdrawReserve()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const deposit = mode === 'deposit'
  const free = Math.max(0, account?.freeCents ?? 0)
  const max = deposit ? free : goal.reservedCents
  const [text, setText] = useState(
    deposit && goal.suggestedCents !== null
      ? formatAmountInput(Math.min(goal.suggestedCents, free) || goal.suggestedCents)
      : '',
  )
  const [error, setError] = useState<string | null>(null)
  const amount = parseAmountInput(text) ?? 0
  const tooMuch = amount > max
  const blocked = deposit && !goal.accountUsable

  async function submit() {
    if (amount <= 0 || tooMuch || saving.current) return
    saving.current = true
    setError(null)
    try {
      const input = { goalId: goal.id, amountCents: amount, requestKey: requestKey.current }
      if (deposit) await addDeposit.mutateAsync(input)
      else await withdraw.mutateAsync(input)
      toast.show(deposit ? `Reservaste ${formatArs(amount)}` : `Liberaste ${formatArs(amount)}`)
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
      requestKey.current = crypto.randomUUID()
    }
  }

  return (
    <BottomSheet
      title={deposit ? 'Agregar a la meta' : 'Retirar de la meta'}
      subtitle={goal.name}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <SectionLabel>{deposit ? '¿Cuánto reservás?' : '¿Cuánto liberás?'}</SectionLabel>
        <AmountInput
          aria-label={deposit ? 'Monto a reservar' : 'Monto a liberar'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          invalid={tooMuch}
        />
        <p className="text-[15px] leading-5 text-text-muted">
          {deposit ? (
            <>
              Libre en {goal.accountName}:{' '}
              <strong className="text-forest">{formatArs(free)}</strong>
            </>
          ) : (
            <>
              Reservado en esta meta:{' '}
              <strong className="text-forest">{formatArs(goal.reservedCents)}</strong>
            </>
          )}
        </p>

        {tooMuch && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[14px] bg-blush/60 p-3 text-[15px] leading-5"
          >
            <span>
              {deposit
                ? free > 0
                  ? `En ${goal.accountName} te quedan ${formatArs(free)} libres: el resto ya está reservado para otras metas o no hay saldo.`
                  : `${goal.accountName} no tiene dinero libre ahora: todo lo que hay ya está reservado o gastado.`
                : `Esta meta tiene reservados ${formatArs(goal.reservedCents)}.`}
            </span>
            {max > 0 && (
              <Button variant="dark" onClick={() => setText(formatAmountInput(max))}>
                Usar {formatArs(max)}
              </Button>
            )}
          </div>
        )}
        {blocked && (
          <p role="alert" className="text-[15px] leading-5 text-expense">
            La cuenta de esta meta ya no está disponible. Editá la meta para pasarla a otra cuenta.
          </p>
        )}

        <MoniSays>
          {deposit
            ? `reservar no es un gasto: ${goal.accountName} mantiene su saldo y este dinero queda apartado para la meta.`
            : 'retirar solo libera la reserva. No mueve plata de tu cuenta ni cuenta como ingreso.'}
        </MoniSays>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button
          disabled={amount <= 0 || tooMuch || blocked || addDeposit.isPending || withdraw.isPending}
          onClick={() => void submit()}
        >
          {deposit ? 'Reservar' : 'Retirar'} {amount > 0 ? formatArs(amount) : ''}
        </Button>
      </div>
    </BottomSheet>
  )
}
