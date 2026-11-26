import { Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import type { Ledger } from '@/features/groups/domain/ledger'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import {
  useBookingMovements,
  useBookings,
  useCancelBooking,
  useDeleteBooking,
  useGroupBookingPaid,
  useLinkMovementToBooking,
  useMyGroupFunding,
  useSetMyGroupFunding,
  useSideExpenses,
} from '../api/useTrips'
import { useArsPerUsd } from '../api/useArsPerUsd'
import { myShareOfBooking, bookingStates, spendFromMovement, spendFromSide, tripFinance, type BookingState, type SpendItem } from '../domain/tripFinance'
import { moneyIn } from '../domain/money'
import { DEFAULT_FUNDING, type FundingChoice, type GroupTripInfo } from '../domain/trip'
import { BookingSheet, type BookingMember } from './BookingSheet'
import { BookingsSection, LinkExpenseSheet } from './BookingsSection'
import { FundingPicker } from './FundingPicker'
import { TripBudgetCard } from './TripBudgetCard'
import { TripExpenseSheet } from './TripExpenseSheet'

const SOURCE_LABEL = { balance: 'Mi saldo', savings: 'Mis ahorros', external: 'De otro lado' } as const

/**
 * The finance of a shared trip, inside its group: the group's totals apart from MY part, the shared budget (only shared bookings count
 * for everybody; mine «solo para mí» stay private), my reservations, and my private origin of the money. Payments of a shared booking are
 * ordinary shared expenses, so division, debts and settlements keep working as always.
 */
export function GroupTripPanel({
  groupId,
  trip,
  ledger,
  meId,
  members,
  isAdmin,
  today,
  onPayShared,
}: {
  groupId: string
  trip: GroupTripInfo
  ledger: Pick<Ledger, 'totalCents' | 'myShareCents' | 'myNetCents' | 'paid'>
  meId: string
  members: readonly BookingMember[]
  isAdmin: boolean
  today: string
  /** Opens the shared-expense form already pointing at this booking. */
  onPayShared: (state: BookingState) => void
}) {
  const toast = useToast()
  const arsPerUsd = useArsPerUsd()
  const bookingsQuery = useBookings()
  const sharedPaid = useGroupBookingPaid(groupId)
  const movements = useBookingMovements()
  const side = useSideExpenses()
  const allMovements = useTransactions()
  const funding = useMyGroupFunding(groupId)
  const setFunding = useSetMyGroupFunding()
  const cancel = useCancelBooking()
  const remove = useDeleteBooking()
  const link = useLinkMovementToBooking()
  const [sheet, setSheet] = useState<{ booking?: BookingState['booking'] } | null>(null)
  const [paying, setPaying] = useState<BookingState | null>(null)
  const [linking, setLinking] = useState<BookingState | null>(null)
  const [fundingOpen, setFundingOpen] = useState(false)
  const [draft, setDraft] = useState<FundingChoice>(DEFAULT_FUNDING)
  const currency = trip.currency ?? 'ARS'

  const bookings = useMemo(() => (bookingsQuery.data ?? []).filter((b) => b.groupId === groupId), [bookingsQuery.data, groupId])
  const ids = useMemo(() => new Set(bookings.map((b) => b.id)), [bookings])
  // What I paid toward my personal bookings of this trip (my own money; never part of the shared totals).
  const mine = useMemo<SpendItem[]>(
    () => [
      ...(movements.data ?? []).filter((t) => t.bookingId && ids.has(t.bookingId)).map((t) => spendFromMovement(t, currency)),
      ...(side.data ?? []).filter((r) => r.booking_id && ids.has(r.booking_id)).map((r) => spendFromSide(r, currency)),
    ],
    [movements.data, side.data, ids, currency],
  )
  const states = useMemo(() => bookingStates(bookings, mine, arsPerUsd, sharedPaid.data ?? new Map()), [bookings, mine, arsPerUsd, sharedPaid.data])
  const sharedStates = states.filter((s) => s.booking.scope === 'shared')
  // The group's money: what the group has spent (payments of shared bookings included) plus what shared bookings still owe.
  const finance = tripFinance({
    currency,
    budgetCents: trip.budgetCents,
    startsOn: trip.startsOn,
    endsOn: trip.endsOn,
    today,
    items: [{ id: 'group', source: 'side', occurredOn: today, title: '', categoryKey: null, bookingId: null, funding: 'balance', ars: ledger.totalCents, usd: null, tripValue: null, tripCurrency: null, tripFxRate: null }],
    bookings: sharedStates,
    arsPerUsd,
  })
  const myPendingShared = sharedStates.reduce((sum, s) => {
    if (s.pendingCents === 0 || !s.booking.participants.includes(meId)) return sum
    return sum + Math.round((s.pendingCents * myShareOfBooking(s.booking, meId)) / s.booking.totalCents)
  }, 0)
  const myPersonalPending = states.filter((s) => s.booking.scope === 'personal').reduce((sum, s) => sum + s.pendingCents, 0)
  const net = ledger.myNetCents
  const candidates = (allMovements.data ?? []).filter((t) => t.kind === 'expense' && t.status === 'posted' && !t.sharedExpenseId && !t.bookingId && !t.tripId)

  return (
    <>
      <TripBudgetCard finance={finance} />
      <section aria-label="Mi parte del viaje" className="rounded-[24px] border border-line bg-card p-4">
        <h2 className="text-[18px] font-extrabold">Mi parte</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[14px]">
          <div>
            <dt className="text-text-muted">Gastos totales del viaje</dt>
            <dd className="font-extrabold">{moneyIn(ledger.totalCents, 'ARS')}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Mi parte de los gastos</dt>
            <dd className="font-extrabold">{moneyIn(ledger.myShareCents, 'ARS')}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Lo que pagué</dt>
            <dd className="font-extrabold">{moneyIn(ledger.paid[meId] ?? 0, 'ARS')}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{net < 0 ? 'Lo que debo' : 'Lo que me deben'}</dt>
            <dd className={`font-extrabold ${net < 0 ? 'text-expense' : net > 0 ? 'text-income' : ''}`}>{moneyIn(Math.abs(net), 'ARS')}</dd>
          </div>
          {myPendingShared > 0 && (
            <div>
              <dt className="text-text-muted">Mi parte de reservas pendientes</dt>
              <dd className="font-extrabold">{moneyIn(myPendingShared, currency)}</dd>
            </div>
          )}
          {myPersonalPending > 0 && (
            <div>
              <dt className="text-text-muted">Mis reservas personales pendientes</dt>
              <dd className="font-extrabold">{moneyIn(myPersonalPending, currency)}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          onClick={() => {
            setDraft(funding.data ?? DEFAULT_FUNDING)
            setFundingOpen(true)
          }}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-full bg-sand px-4 text-[14px] font-extrabold"
        >
          <Wallet aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 text-left">
            Mi origen de la plata: {funding.data ? SOURCE_LABEL[funding.data.source] : 'sin definir'}
            <span className="block text-[12px] font-bold text-text-muted">Solo lo ves vos</span>
          </span>
        </button>
      </section>

      <BookingsSection
        states={states}
        meId={meId}
        title="Reservas del viaje"
        onAdd={() => setSheet({})}
        actions={{
          pay: (state) => (state.booking.scope === 'shared' ? onPayShared(state) : setPaying(state)),
          edit: (state) => setSheet({ booking: state.booking }),
          link: (state) => (state.booking.scope === 'personal' ? setLinking(state) : undefined),
          setCancelled: async (state, cancelled) => {
            await cancel.mutateAsync({ id: state.booking.id, cancelled })
          },
          remove: async (state) => {
            await remove.mutateAsync(state.booking.id)
          },
          canManage: (state) => state.booking.ownerId === meId || (state.booking.scope === 'shared' && isAdmin),
        }}
      />

      {sheet && <BookingSheet target={{ groupId }} booking={sheet.booking} defaultCurrency={currency} members={members} meId={meId} onClose={() => setSheet(null)} />}
      {paying && (
        <TripExpenseSheet
          trip={{ id: null, currency: paying.booking.currency, funding: funding.data }}
          payment={{ booking: paying.booking, pendingCents: paying.pendingCents }}
          onClose={() => setPaying(null)}
        />
      )}
      {linking && (
        <LinkExpenseSheet
          candidates={candidates}
          bookingTitle={linking.booking.title}
          onClose={() => setLinking(null)}
          onPick={async (t) => {
            try {
              await link.mutateAsync({ transactionId: t.id, bookingId: linking.booking.id })
              toast.show('Gasto vinculado a la reserva')
              setLinking(null)
            } catch (e) {
              toast.show(toUserMessage(e), { tone: 'error' })
            }
          }}
        />
      )}
      {fundingOpen && (
        <BottomSheet title="Mi origen de la plata" onClose={() => setFundingOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-5 text-text-muted">
              Es tuyo: nadie más del viaje ve tus ahorros, saldos ni medios de pago. Se usa como punto de partida cuando pagás un gasto del viaje.
            </p>
            <FundingPicker value={draft} onChange={setDraft} currency="ARS" idPrefix="group-trip" />
            <Button
              disabled={setFunding.isPending}
              onClick={async () => {
                try {
                  await setFunding.mutateAsync({ groupId, funding: draft })
                  toast.show('Guardado')
                  setFundingOpen(false)
                } catch (e) {
                  toast.show(toUserMessage(e), { tone: 'error' })
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
