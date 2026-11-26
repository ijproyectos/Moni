import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useSetGroupTrip } from '../api/useTrips'
import type { GroupTripInfo, TripCurrency } from '../domain/trip'
import { TripDatePicker, TripDatesBudget, tripFieldClass } from './TripFormParts'

/** Edits the dates, destination, currency and budget of a group trip (only the group's administrators; the server checks it again). */
export function GroupTripEditSheet({ groupId, info, onClose }: { groupId: string; info: GroupTripInfo; onClose: () => void }) {
  const toast = useToast()
  const setTrip = useSetGroupTrip()
  const [dates, setDates] = useState({ startsOn: info.startsOn, endsOn: info.endsOn })
  const [destination, setDestination] = useState(info.destination ?? '')
  const [currency, setCurrency] = useState<TripCurrency>(info.currency ?? 'ARS')
  const [budgetText, setBudgetText] = useState(info.budgetCents > 0 ? formatAmountInput(info.budgetCents) : '')
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null)
  const [error, setError] = useState<string | null>(null)
  const budgetCents = parseAmountInput(budgetText) ?? 0

  async function save() {
    setError(null)
    if (budgetText.trim() !== '' && parseAmountInput(budgetText) === null) return setError('Revisá el presupuesto.')
    try {
      await setTrip.mutateAsync({ groupId, values: { ...dates, budgetCents, destination, currency } })
      toast.show('Viaje actualizado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (picking) {
    return (
      <TripDatePicker
        picking={picking}
        {...dates}
        onClose={() => setPicking(null)}
        onChange={(next) => {
          setDates(next)
          setPicking(null)
        }}
      />
    )
  }

  return (
    <BottomSheet title="Editar viaje en grupo" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>Destino</SectionLabel>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          aria-label="Destino"
          maxLength={80}
          placeholder="Destino (opcional)"
          className={tripFieldClass}
        />
        <SegmentedControl
          label="Moneda principal del viaje"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'ARS', label: 'Pesos' },
            { value: 'USD', label: 'Dólares' },
          ]}
        />
        <TripDatesBudget
          {...dates}
          budgetText={budgetText}
          budgetLabel="Presupuesto del grupo (opcional)"
          currency={currency}
          budgetCents={budgetCents}
          onPick={setPicking}
          onBudgetChange={setBudgetText}
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={setTrip.isPending}>
          {setTrip.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </BottomSheet>
  )
}
