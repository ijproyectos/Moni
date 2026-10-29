import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useAdjustAccountBalance } from '../api/useAccounts'
import { adjustmentTarget, isCreditCard, parseSignedAmount, type Account } from '../domain/account'

/**
 * "Ajustar saldo": the person types what the account really holds (or, for a card, what it really
 * owes) and Moni records only the difference. It is not income or expense, so no statistic moves.
 */
export function AdjustBalanceSection({
  account,
  onDone,
}: {
  account: Account
  onDone: () => void
}) {
  const toast = useToast()
  const adjust = useAdjustAccountBalance()
  const card = isCreditCard(account)
  const current = card ? Math.abs(account.balanceCents) : account.balanceCents
  const [text, setText] = useState(formatAmountInput(current))
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    const typed = parseSignedAmount(text)
    if (typed === null) return setError('Ingresá un monto válido.')
    const targetCents = adjustmentTarget(account, typed)
    if (targetCents === account.balanceCents) return setError('Ese ya es el saldo actual.')
    setError(null)
    try {
      await adjust.mutateAsync({ id: account.id, targetCents })
      toast.show('Saldo ajustado', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{card ? 'Ajustar deuda' : 'Ajustar saldo'}</SectionLabel>
      <p className="text-[14px] leading-5 text-text-muted">
        {card ? 'Hoy figura una deuda de ' : 'Hoy figura un saldo de '}
        {formatArs(current)}. Poné {card ? 'lo que debés' : 'lo que tenés'} de verdad y Moni
        registra la diferencia. No cuenta como ingreso ni gasto.
      </p>
      <AmountInput
        scale="md"
        aria-label={card ? 'Deuda real' : 'Saldo real'}
        invalid={Boolean(error)}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <Button variant="dark" onClick={() => void apply()} disabled={adjust.isPending}>
        {adjust.isPending ? 'Ajustando…' : card ? 'Ajustar deuda' : 'Ajustar saldo'}
      </Button>
    </div>
  )
}
