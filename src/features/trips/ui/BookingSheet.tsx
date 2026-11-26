import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip, SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateBooking, useUpdateBooking } from '../api/useTrips'
import type { BookingTarget } from '../api/tripsRepository'
import {
  bookingProblem,
  LODGING_TYPES,
  nightsOf,
  OTHER_BOOKING_TYPES,
  TRANSPORT_TYPES,
  type BookingFormValues,
  type BookingKind,
  type TripBooking,
} from '../domain/bookings'
import type { TripCurrency } from '../domain/trip'
import { tripFieldClass } from './TripFormParts'

export interface BookingMember {
  userId: string
  name: string
}

const TYPES = { transport: TRANSPORT_TYPES, lodging: LODGING_TYPES, other: OTHER_BOOKING_TYPES } as const
const TITLES: Record<BookingKind, { label: string; placeholder: string }> = {
  transport: { label: 'Aerolínea o empresa', placeholder: 'Ej: Aerolíneas Argentinas' },
  lodging: { label: 'Alojamiento', placeholder: 'Ej: Hotel Sol, Airbnb centro…' },
  other: { label: 'Reserva', placeholder: 'Ej: Alquiler de auto, excursión…' },
}

/**
 * Creates or edits a booking (pasaje, alojamiento or another reservation). Only the name and the total cost are needed; the rest is
 * optional. In a shared trip the booking can be only for the person or shared with the members who take part.
 */
export function BookingSheet({
  target,
  booking,
  defaultCurrency,
  members,
  meId,
  onClose,
}: {
  target: BookingTarget
  booking?: TripBooking
  defaultCurrency: TripCurrency
  /** Members of the group, in a shared trip (enables «Solo para mí» / «Compartida»). */
  members?: readonly BookingMember[]
  meId?: string
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateBooking()
  const update = useUpdateBooking()
  const [kind, setKind] = useState<BookingKind>(booking?.kind ?? 'transport')
  const [subtype, setSubtype] = useState<string | null>(booking?.subtype ?? null)
  const [title, setTitle] = useState(booking?.title ?? '')
  const [origin, setOrigin] = useState(booking?.origin ?? '')
  const [destination, setDestination] = useState(booking?.destination ?? '')
  const [address, setAddress] = useState(booking?.address ?? '')
  const [startsOn, setStartsOn] = useState<string>(booking?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState<string>(booking?.endsOn ?? '')
  const [totalText, setTotalText] = useState(booking ? formatAmountInput(booking.totalCents) : '')
  const [currency, setCurrency] = useState<TripCurrency>(booking?.currency ?? defaultCurrency)
  const [deadline, setDeadline] = useState<string>(booking?.payDeadline ?? '')
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [scope, setScope] = useState<'personal' | 'shared'>(booking?.scope ?? 'personal')
  const [participants, setParticipants] = useState<string[]>(booking?.participants ?? (meId ? [meId] : []))
  const [error, setError] = useState<string | null>(null)
  const nights = kind === 'lodging' ? nightsOf(startsOn || null, endsOn || null) : null
  const inGroup = 'groupId' in target && Boolean(members?.length)

  async function submit() {
    setError(null)
    const values: BookingFormValues = {
      kind,
      subtype,
      title,
      origin,
      destination,
      address,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      totalCents: parseAmountInput(totalText) ?? 0,
      currency,
      payDeadline: deadline || null,
      notes,
      scope: inGroup ? scope : 'personal',
      participants: inGroup && scope === 'shared' ? participants : [],
    }
    const problem = bookingProblem(values)
    if (problem) return setError(problem)
    try {
      if (booking) await update.mutateAsync({ id: booking.id, values })
      else await create.mutateAsync({ target, values })
      toast.show(booking ? 'Reserva actualizada' : 'Reserva guardada')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  const dateLabels = kind === 'lodging' ? ['Check-in', 'Check-out'] : kind === 'transport' ? ['Ida', 'Vuelta'] : ['Desde', 'Hasta']

  return (
    <BottomSheet title={booking ? 'Editar reserva' : 'Nueva reserva'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {inGroup && (
          <>
            <SegmentedControl
              label="Quién la ve"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'personal', label: 'Solo para mí' },
                { value: 'shared', label: 'Compartida' },
              ]}
            />
            {scope === 'shared' ? (
              <div role="group" aria-label="Quiénes participan" className="flex flex-wrap gap-2">
                {(members ?? []).map((m) => (
                  <ChoiceChip
                    key={m.userId}
                    selected={participants.includes(m.userId)}
                    onClick={() => setParticipants((cur) => (cur.includes(m.userId) ? cur.filter((id) => id !== m.userId) : [...cur, m.userId]))}
                    className="min-h-10 px-3 text-[14px]"
                  >
                    {m.userId === meId ? 'Yo' : m.name}
                  </ChoiceChip>
                ))}
              </div>
            ) : null}
            <p className="text-[13px] leading-5 text-text-muted">
              {scope === 'shared'
                ? 'Todos los integrantes ven el costo, lo pagado y lo pendiente; nunca tus ahorros, saldos ni medios de pago. Los pagos se cargan como gastos compartidos del grupo.'
                : 'Solo vos la ves y gestionás sus pagos.'}
            </p>
          </>
        )}
        {!booking && (
          <SegmentedControl
            label="Tipo de reserva"
            value={kind}
            onChange={(next) => {
              setKind(next)
              setSubtype(null)
            }}
            options={[
              { value: 'transport', label: 'Pasaje' },
              { value: 'lodging', label: 'Alojamiento' },
              { value: 'other', label: 'Otra' },
            ]}
          />
        )}
        <div role="group" aria-label="Detalle" className="flex flex-wrap gap-2">
          {TYPES[kind].map((t) => (
            <ChoiceChip key={t.key} selected={subtype === t.key} onClick={() => setSubtype(subtype === t.key ? null : t.key)} className="min-h-10 px-3 text-[14px]">
              {t.label}
            </ChoiceChip>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={TITLES[kind].label}
          maxLength={80}
          placeholder={TITLES[kind].placeholder}
          className={tripFieldClass}
        />
        {kind === 'transport' && (
          <div className="grid grid-cols-2 gap-2">
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origen" maxLength={80} placeholder="Origen" className={tripFieldClass} />
            <input value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Destino" maxLength={80} placeholder="Destino" className={tripFieldClass} />
          </div>
        )}
        {kind === 'lodging' && (
          <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Dirección" maxLength={160} placeholder="Dirección (opcional)" className={tripFieldClass} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
            {dateLabels[0]}
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label={dateLabels[0]} className={tripFieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
            {dateLabels[1]}
            <input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} aria-label={dateLabels[1]} className={tripFieldClass} />
          </label>
        </div>
        {nights !== null && (
          <p className="text-[14px] font-extrabold" aria-live="polite">
            {nights} {nights === 1 ? 'noche' : 'noches'}
          </p>
        )}
        <SectionLabel>Costo total</SectionLabel>
        <AmountInput aria-label="Costo total" prefix={currency === 'USD' ? 'US$' : '$'} value={totalText} onChange={(e) => setTotalText(e.target.value)} />
        <SegmentedControl
          label="Moneda de la reserva"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'ARS', label: 'Pesos' },
            { value: 'USD', label: 'Dólares' },
          ]}
        />
        <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
          Fecha límite de pago (opcional)
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Fecha límite de pago" className={tripFieldClass} />
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Notas"
          maxLength={400}
          rows={2}
          placeholder="Notas (opcional)"
          className="rounded-[18px] border border-line bg-card px-4 py-3 text-[16px] placeholder:text-text-muted"
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={create.isPending || update.isPending}>
          {create.isPending || update.isPending ? 'Guardando…' : 'Guardar reserva'}
        </Button>
      </div>
    </BottomSheet>
  )
}
