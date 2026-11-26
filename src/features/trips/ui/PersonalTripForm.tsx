import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useCreateTrip, useUpdateTrip } from '../api/useTrips'
import { defaultTripDates, tripFormSchema, type FundingChoice, type PersonalTrip, type TripCurrency } from '../domain/trip'
import { FundingPicker } from './FundingPicker'
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
  const [destination, setDestination] = useState(trip?.destination ?? '')
  const [currency, setCurrency] = useState<TripCurrency>(trip?.currency ?? 'ARS')
  const [funding, setFunding] = useState<FundingChoice | null>(trip?.funding ?? null)
  const [budgetText, setBudgetText] = useState(trip && trip.budgetCents > 0 ? formatAmountInput(trip.budgetCents) : '')
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = createTrip.isPending || updateTrip.isPending
  const budgetCents = Math.max(0, parseAmountInput(budgetText) ?? 0)

  async function submit() {
    setError(null)
    const result = tripFormSchema.safeParse({ name, ...dates, budget: budgetText, destination, currency })
    if (!result.success) return setError(result.error.issues[0]?.message ?? 'Revisá los datos.')
    try {
      const values = { ...result.data, funding }
      const saved = trip
        ? await updateTrip.mutateAsync({ id: trip.id, values })
        : await createTrip.mutateAsync(values)
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
        <SectionLabel>Tu viaje</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del viaje"
          maxLength={60}
          placeholder="Ej: Vacaciones en Brasil"
          className={tripFieldClass}
        />
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          aria-label="Destino"
          maxLength={80}
          placeholder="Destino (opcional) · Ej: Florianópolis"
          className={tripFieldClass}
        />
        <TripDatesBudget
          {...dates}
          budgetText={budgetText}
          budgetLabel="Presupuesto (opcional)"
          budgetCents={budgetCents}
          onPick={setPicking}
          onBudgetChange={setBudgetText}
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
        <SectionLabel>¿De dónde sale la plata? (opcional)</SectionLabel>
        {funding ? (
          <FundingPicker value={funding} onChange={setFunding} currency={currency} idPrefix="trip" />
        ) : (
          <button
            type="button"
            onClick={() => setFunding({ source: 'balance', accountId: null, ahorroCurrency: null })}
            className="min-h-12 rounded-[18px] border-2 border-dashed border-line px-4 text-left text-[15px] font-bold text-text-muted"
          >
            Definir el origen de la plata por defecto (se puede cambiar en cada gasto)
          </button>
        )}
        <p className="text-[13px] leading-5 text-text-muted">Crear el viaje no descuenta plata: el presupuesto es solo una referencia.</p>
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
