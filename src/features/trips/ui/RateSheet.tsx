import { useState } from 'react'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { useSetTripExpenseRate } from '../api/useTrips'
import type { TripCurrency } from '../domain/trip'
import { tripFieldClass } from './TripFormParts'

/**
 * An expense saved without a rate is not in the trip's converted total yet. Here the rate is entered by hand (pesos per dollar); it is
 * saved with the expense and fixed: it will not change with the rate of any other day.
 */
export function RateSheet({
  kind,
  id,
  title,
  tripCurrency,
  suggested,
  onClose,
}: {
  kind: 'transaction' | 'side'
  id: string
  title: string
  tripCurrency: TripCurrency
  /** Today's rate, offered only as a starting point the person confirms. */
  suggested: number | null
  onClose: () => void
}) {
  const toast = useToast()
  const set = useSetTripExpenseRate()
  const [text, setText] = useState(suggested ? String(suggested).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const cents = parseAmountInput(text)
    if (!cents || cents <= 0) return setError('Poné la cotización (pesos por dólar).')
    try {
      await set.mutateAsync({ kind, id, rate: cents / 100 })
      toast.show('Cotización guardada')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Agregar cotización" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-6">
          <strong className="font-extrabold">{title}</strong> está en otra moneda y se guardó sin cotización, por eso todavía no suma al total en{' '}
          {tripCurrency === 'USD' ? 'dólares' : 'pesos'}.
        </p>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Cotización del dólar"
          placeholder="Pesos por dólar"
          className={tripFieldClass}
        />
        <p className="text-[13px] leading-5 text-text-muted">
          Se guarda con este gasto y queda fija: no cambia con la cotización de otro día.
          {suggested ? ' Te sugerimos la de hoy; confirmala o cambiala.' : ''}
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={set.isPending}>
          Guardar cotización
        </Button>
      </div>
    </BottomSheet>
  )
}
