import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useAddTripExpense } from '../api/useTrips'
import { useArsPerUsd } from '../api/useArsPerUsd'
import type { TripBooking } from '../domain/bookings'
import { moneyIn } from '../domain/money'
import { categoryForBooking } from '../domain/tripCategories'
import { DEFAULT_FUNDING, type FundingChoice, type TripCurrency } from '../domain/trip'
import { FundingPicker } from './FundingPicker'
import { TripCategoryPicker } from './TripCategoryPicker'
import { tripFieldClass } from './TripFormParts'

export interface TripExpenseTarget {
  /** null only for a payment of one of my personal bookings of a group trip. */
  id: string | null
  currency: TripCurrency
  /** The trip's default origin of the money; it can be changed in each expense. */
  funding?: FundingChoice | null
}

/**
 * Loads an expense of the trip (or, with `payment`, a payment of a booking): amount and currency, description, date, category inside the
 * trip, and where the money comes from. The origin starts as the trip's default and can be changed here. Everything is saved at once by the
 * server, so a payment is never counted as a second expense.
 */
export function TripExpenseSheet({
  trip,
  payment,
  onClose,
  onSaved,
}: {
  trip: TripExpenseTarget
  payment?: { booking: TripBooking; pendingCents: number }
  onClose: () => void
  onSaved?: () => void
}) {
  const toast = useToast()
  const add = useAddTripExpense()
  const arsPerUsd = useArsPerUsd()
  const booking = payment?.booking
  const [currency, setCurrency] = useState<TripCurrency>(booking?.currency ?? trip.currency)
  const [amountText, setAmountText] = useState(payment && payment.pendingCents > 0 ? formatAmountInput(payment.pendingCents) : '')
  const [fxText, setFxText] = useState('')
  const [description, setDescription] = useState(booking ? `Pago · ${booking.title}` : '')
  const [date, setDate] = useState(todayIso())
  const [category, setCategory] = useState<string | null>(booking ? categoryForBooking(booking.kind, booking.subtype) : null)
  const [funding, setFunding] = useState<FundingChoice>(trip.funding ?? DEFAULT_FUNDING)
  const [error, setError] = useState<string | null>(null)

  const amountCents = parseAmountInput(amountText) ?? 0
  // A dollar amount that touches my accounts needs the rate to know its value in pesos.
  const needsRate = currency === 'USD' && (funding.source === 'balance' || (funding.source === 'savings' && funding.accountId !== null))
  const fxRate = parseAmountInput(fxText) !== null ? (parseAmountInput(fxText) as number) / 100 : (arsPerUsd ?? null)

  async function submit() {
    setError(null)
    if (amountCents <= 0) return setError('Poné el importe.')
    if (funding.source === 'balance' && !funding.accountId) return setError('Elegí el medio de pago.')
    if (needsRate && !fxRate) return setError('Poné la cotización del dólar para registrarlo en pesos.')
    try {
      await add.mutateAsync({
        tripId: trip.id,
        amountCents,
        currency,
        fxRate: needsRate || currency === 'USD' ? fxRate : null,
        description,
        occurredOn: date,
        categoryKey: category,
        funding: funding.source === 'savings' ? { ...funding, ahorroCurrency: currency } : funding,
        bookingId: booking?.id ?? null,
      })
      toast.show(booking ? 'Pago registrado' : 'Gasto cargado')
      onSaved?.()
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title={booking ? 'Registrar un pago' : 'Cargar gasto'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {payment && (
          <p className="rounded-[16px] bg-sand px-4 py-2 text-[14px] leading-5">
            <strong className="font-extrabold">{booking?.title}</strong> · total {moneyIn(booking?.totalCents ?? 0, booking?.currency ?? currency)} · pendiente{' '}
            {moneyIn(payment.pendingCents, booking?.currency ?? currency)}
          </p>
        )}
        <AmountInput
          aria-label="Importe"
          prefix={currency === 'USD' ? 'US$' : '$'}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <SegmentedControl
          label="Moneda"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'ARS', label: 'Pesos' },
            { value: 'USD', label: 'Dólares' },
          ]}
        />
        {currency === 'USD' && (
          <label className="flex flex-col gap-1 text-[14px] font-bold text-text-muted">
            Cotización (pesos por dólar){needsRate ? '' : ' · opcional'}
            <input
              inputMode="decimal"
              value={fxText}
              onChange={(e) => setFxText(e.target.value)}
              placeholder={arsPerUsd ? String(arsPerUsd).replace('.', ',') : 'Ej: 1.200'}
              aria-label="Cotización del dólar"
              className={tripFieldClass}
            />
          </label>
        )}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Descripción"
          maxLength={200}
          placeholder="Descripción (opcional)"
          className={tripFieldClass}
        />
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" className={tripFieldClass} />
        <SectionLabel>Categoría</SectionLabel>
        <TripCategoryPicker value={category} onChange={setCategory} />
        <SectionLabel>¿De dónde sale la plata?</SectionLabel>
        <FundingPicker value={funding} onChange={setFunding} currency={currency} idPrefix="expense" />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={add.isPending}>
          {add.isPending ? 'Guardando…' : booking ? 'Registrar pago' : 'Cargar gasto'}
        </Button>
      </div>
    </BottomSheet>
  )
}
