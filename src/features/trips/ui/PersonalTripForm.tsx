import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { useCreateTrip, useUpdateTrip } from '../api/useTrips'
import { defaultTripDates, tripFormSchema, type PersonalTrip } from '../domain/trip'
import { TripDatePicker, TripDatesBudget, tripFieldClass } from './TripFormParts'

/**
 * Create (no `trip`) or edit (with `trip`) a personal trip: destination, dates and budget. Nothing about guests or
 * invitations: a personal trip is only the person's own.
 */
export function PersonalTripForm({
  trip,
  onClose,
  onSaved,
}: {
  trip?: PersonalTrip
  onClose: () => void
  onSaved: (trip: PersonalTrip) => void
}) {
  const today = todayIso()
  const createTrip = useCreateTrip()
  const updateTrip = useUpdateTrip()
  const defaults = defaultTripDates(today)
  const [name, setName] = useState(trip?.name ?? '')
  const [dates, setDates] = useState({
    startsOn: trip?.startsOn ?? defaults.startsOn,
    endsOn: trip?.endsOn ?? defaults.endsOn,
  })
  const [budgetText, setBudgetText] = useState(trip ? formatAmountInput(trip.budgetCents) : '')
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = createTrip.isPending || updateTrip.isPending
  const budgetCents = Math.max(0, parseAmountInput(budgetText) ?? 0)

  async function submit() {
    setError(null)
    const result = tripFormSchema.safeParse({ name, ...dates, budget: budgetText })
    if (!result.success) return setError(result.error.issues[0]?.message ?? 'Revisá los datos.')
    try {
      const saved = trip
        ? await updateTrip.mutateAsync({ id: trip.id, values: result.data })
        : await createTrip.mutateAsync(result.data)
      onSaved(saved)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (picking) {
    return (
      <TripDatePicker
        picking={picking}
        {...dates}
        min={trip ? undefined : today}
        onClose={() => setPicking(null)}
        onChange={(next) => {
          setDates(next)
          setPicking(null)
        }}
      />
    )
  }

  return (
    <BottomSheet title={trip ? 'Editar viaje' : 'Viaje personal'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿A dónde vas?</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Destino"
          maxLength={60}
          placeholder="Ej: Semana en Salta"
          className={tripFieldClass}
        />
        <TripDatesBudget
          {...dates}
          budgetText={budgetText}
          budgetLabel="Presupuesto para vos"
          budgetCents={budgetCents}
          onPick={setPicking}
          onBudgetChange={setBudgetText}
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? 'Guardando…' : trip ? 'Guardar cambios' : 'Crear viaje'}
        </Button>
      </div>
    </BottomSheet>
  )
}
