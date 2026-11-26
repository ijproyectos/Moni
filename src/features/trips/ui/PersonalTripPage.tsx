import { TripIconButton } from './TripIconPicker'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useAuth } from '@/features/auth/api/authContext'
import { useTransactions, useVoidTransaction } from '@/features/transactions/api/useTransactions'
import type { Transaction } from '@/features/transactions/domain/transaction'
import { MovementSummarySheet } from '@/features/transactions/ui/MovementSummarySheet'
import { toUserMessage } from '@/shared/lib/errors'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { SwipeRow } from '@/shared/ui/SwipeRow'
import { useFormatMoney } from '@/shared/ui/useFormatMoney'
import { tripKeys } from '../api/queryKeys'
import { useCategories } from '@/features/categories/api/useCategories'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { usePlus } from '@/features/plus/api/usePlus'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Page, SectionLabel } from '@/shared/ui/kit'
import { MovementRow } from '@/shared/ui/MovementRow'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { isTripsNotEnabled } from '../api/tripsRepository'
import {
  useBookings,
  useCancelBooking,
  useDeleteBooking,
  useLinkMovementToBooking,
  useSideExpenses,
  useTripCategories,
  useTripExpenses,
  useTrips,
  useVoidSideExpense,
} from '../api/useTrips'
import { useArsPerUsd } from '../api/useArsPerUsd'
import { daysBetween, rangeLabel } from '../domain/dates'
import { moneyIn } from '../domain/money'
import { tripExpenses } from '../domain/trip'
import { allTripCategories, categoryOf } from '../domain/tripCategories'
import { bookingStates, spendFromMovement, spendFromSide, tripFinance, valueIn, type BookingState, type SpendItem } from '../domain/tripFinance'
import { RateSheet } from './RateSheet'
import { tripInsights } from '../domain/tripInsights'
import { BookingSheet } from './BookingSheet'
import { BookingsSection, LinkExpenseSheet } from './BookingsSection'
import { PersonalTripForm } from './PersonalTripForm'
import { TripBudgetCard } from './TripBudgetCard'
import { TripCategoryIcon } from './TripCategoryIcon'
import { TripExpenseSheet } from './TripExpenseSheet'

// Screen 038 — Viaje personal: budget against what was really spent, and the trip's movements.
export function PersonalTripPage() {
  const { id } = useParams()
  const trips = useTrips()
  const expensesQuery = useTripExpenses()
  const categories = useCategories(undefined, { includeArchived: true })
  const { openEdit } = useMovementSheet()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [opened, setOpened] = useState<Transaction | null>(null)
  const [pendingVoid, setPendingVoid] = useState<Transaction | null>(null)
  const accounts = useAccounts()
  const voidTransaction = useVoidTransaction()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const today = todayIso()
  const money = useFormatMoney()
  const sideQuery = useSideExpenses()
  const bookingsQuery = useBookings()
  const customCategories = useTripCategories()
  const allMovements = useTransactions()
  const voidSide = useVoidSideExpense()
  const cancelBooking = useCancelBooking()
  const deleteBooking = useDeleteBooking()
  const linkMovement = useLinkMovementToBooking()
  const arsPerUsd = useArsPerUsd()
  const { isPlus } = usePlus()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [bookingSheet, setBookingSheet] = useState<{ booking?: BookingState['booking'] } | null>(null)
  const [paying, setPaying] = useState<BookingState | null>(null)
  const [linking, setLinking] = useState<BookingState | null>(null)
  const [pendingSideVoid, setPendingSideVoid] = useState<SpendItem | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [rateFor, setRateFor] = useState<SpendItem | null>(null)

  async function confirmVoid() {
    if (!pendingVoid) return
    try {
      await voidTransaction.mutateAsync(pendingVoid.id)
      await queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) })
      toast.show('Gasto eliminado')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
    setPendingVoid(null)
  }

  if (trips.isLoading) {
    return (
      <Page>
        <PageHeader title="Viaje" fallbackTo="/viajes" />
        <div role="status" aria-label="Cargando el viaje" className="flex flex-col gap-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-32" />
        </div>
      </Page>
    )
  }
  const trip = trips.data?.find((t) => t.id === id)
  if (trips.isError || !trip) {
    return (
      <Page>
        <PageHeader title="Viaje" fallbackTo="/viajes" />
        <EmptyState
          mascotUrl={mascotUrl}
          title={
            trips.isError && !isTripsNotEnabled(trips.error)
              ? 'No pudimos cargar el viaje'
              : 'No encontramos este viaje'
          }
          description="Volvé a Viajes para ver los tuyos."
          action={
            trips.isError ? (
              <Button onClick={() => void trips.refetch()}>Reintentar</Button>
            ) : undefined
          }
        />
      </Page>
    )
  }

  const expenses = tripExpenses(trip.id, expensesQuery.data ?? [])
  const currency = trip.currency ?? 'ARS'
  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const tripCategories = allTripCategories(customCategories.data ?? [])
  const items: SpendItem[] = [
    ...expenses.map((t) => spendFromMovement(t, currency)),
    ...(sideQuery.data ?? []).filter((r) => r.trip_id === trip.id).map((r) => spendFromSide(r, currency)),
  ].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0))
  const bookings = (bookingsQuery.data ?? []).filter((b) => b.tripId === trip.id)
  const states = bookingStates(bookings, items, arsPerUsd)
  const finance = tripFinance({ currency, budgetCents: trip.budgetCents, startsOn: trip.startsOn, endsOn: trip.endsOn, today, items, bookings: states, arsPerUsd })
  const totalDays = Math.max(1, daysBetween(trip.startsOn, trip.endsOn))
  const status = today < trip.startsOn ? 'upcoming' : today > trip.endsOn ? 'ended' : 'ongoing'
  const insights = isPlus ? tripInsights({ finance, bookings: states, today, categories: tripCategories, status }) : []
  const candidates = (allMovements.data ?? []).filter(
    (t) => t.kind === 'expense' && t.status === 'posted' && !t.sharedExpenseId && !t.bookingId && (!t.tripId || t.tripId === trip.id),
  )
  const visibleItems = showAll ? items : items.slice(0, 8)

  function describe(item: SpendItem) {
    const movement = item.movement
    const category = movement?.categoryId ? categoryById.get(movement.categoryId) : undefined
    return item.title || (item.categoryKey ? categoryOf(item.categoryKey, tripCategories).label : category?.name) || 'Gasto'
  }

  async function confirmSideVoid() {
    if (!pendingSideVoid) return
    try {
      await voidSide.mutateAsync(pendingSideVoid.id)
      toast.show('Gasto eliminado')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
    setPendingSideVoid(null)
  }

  return (
    <Page>
      <PageHeader
        title={trip.name}
        fallbackTo="/viajes"
        action={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex min-h-12 items-center gap-2 rounded-full bg-sand px-4 text-[16px] font-extrabold"
          >
            <Pencil aria-hidden="true" className="size-4" /> Editar
          </button>
        }
      />
      <div className="-mt-2 flex items-center gap-3">
        <TripIconButton tripId={trip.id} name={trip.name} icon={trip.icon} />
        <p className="text-[16px] text-text-muted">
          {trip.destination ? `${trip.destination} · ` : ''}
          {rangeLabel(trip.startsOn, trip.endsOn)} · {totalDays} {totalDays === 1 ? 'día' : 'días'}
        </p>
      </div>

      <TripBudgetCard finance={finance} onSetBudget={() => setEditing(true)} />

      {insights.length > 0 && (
        <section aria-label="Moni te cuenta" className="flex flex-col gap-2 rounded-[24px] border border-line bg-card p-4">
          <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
            <Sparkles aria-hidden="true" className="size-5" /> Moni te cuenta
          </h2>
          <ul className="flex flex-col gap-2">
            {insights.map((i) => (
              <li key={i.id} className="text-[15px] leading-6">
                {i.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BookingsSection
        states={states}
        onAdd={() => setBookingSheet({})}
        actions={{
          pay: (state) => setPaying(state),
          edit: (state) => setBookingSheet({ booking: state.booking }),
          link: (state) => setLinking(state),
          setCancelled: async (state, cancelled) => {
            await cancelBooking.mutateAsync({ id: state.booking.id, cancelled })
          },
          remove: async (state) => {
            await deleteBooking.mutateAsync(state.booking.id)
          },
        }}
      />

      {finance.byCategory.length > 0 && (
        <section className="rounded-[24px] border border-line bg-card p-4">
          <h2 className="text-[20px] font-extrabold">Gastos por categoría</h2>
          <ul className="mt-1 divide-y divide-line">
            {finance.byCategory.map((row) => {
              const category = categoryOf(row.key, tripCategories)
              return (
                <li key={row.key} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint-green text-ink">
                    <TripCategoryIcon icon={category.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-extrabold">{category.label}</span>
                    <span className="block text-[13px] text-text-muted">{Math.round(row.share * 100)}% de lo gastado</span>
                  </span>
                  <span className="text-[16px] font-extrabold">{moneyIn(row.cents, currency)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <SectionLabel>Últimos movimientos</SectionLabel>
      {expensesQuery.isLoading ? (
        <Skeleton className="h-24" />
      ) : items.length === 0 ? (
        <p className="rounded-[24px] border border-line bg-card p-4 text-[16px] text-text-muted">
          Todavía no cargaste gastos de este viaje.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-[24px] border border-line bg-card px-4">
            {visibleItems.map((item) => {
              const t = item.movement
              const name = describe(item)
              const tripCategory = categoryOf(item.categoryKey, tripCategories)
              const origin = item.funding === 'savings' ? ' · Ahorros' : item.source === 'side' ? ' · de otro lado' : ''
              const noRate = valueIn(item, currency) === null
              const amount = item.usd !== null && currency === 'USD' ? moneyIn(item.usd, 'USD') : item.ars !== null ? money(-item.ars) : moneyIn(item.usd ?? 0, 'USD')
              return (
                <li key={`${item.source}-${item.id}`}>
                  <SwipeRow
                    surfaceClassName="bg-card"
                    leadingAction={
                      t && t.accountId !== null
                        ? { label: 'Editar', tone: 'primary', icon: <Pencil className="size-5" strokeWidth={2.2} />, ariaLabel: `Editar ${name}`, onPress: () => openEdit(t) }
                        : undefined
                    }
                    actions={[
                      {
                        label: 'Eliminar',
                        tone: 'danger',
                        icon: <Trash2 className="size-5" strokeWidth={2.2} />,
                        ariaLabel: `Eliminar ${name}`,
                        onPress: () => (t ? setPendingVoid(t) : setPendingSideVoid(item)),
                      },
                    ]}
                  >
                    <MovementRow
                      leading={
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tint-green text-ink">
                          <TripCategoryIcon icon={tripCategory.icon} />
                        </span>
                      }
                      title={name}
                      subtitle={`${tripCategory.label === name ? '' : tripCategory.label + ' · '}${formatRelativeDay(item.occurredOn, today)}${origin}`}
                      trailing={amount}
                      onPress={t ? () => setOpened(t) : undefined}
                      pressLabel={`Ver detalle de ${name}`}
                    />
                  </SwipeRow>
                  {noRate && (
                    <button
                      type="button"
                      onClick={() => setRateFor(item)}
                      className="mb-2 ml-14 min-h-9 rounded-full border-2 border-dashed border-line px-3 text-[13px] font-extrabold text-text-muted"
                    >
                      Sin cotización · Agregar
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {items.length > 8 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mx-auto min-h-11 px-4 text-[14px] font-extrabold text-text-muted">
              {showAll ? 'Ver menos' : `Ver los ${items.length} movimientos`}
            </button>
          )}
        </>
      )}

      {opened && (
        <MovementSummarySheet
          transaction={opened}
          category={opened.categoryId ? categoryById.get(opened.categoryId) : undefined}
          accountName={(accounts.data ?? []).find((a) => a.id === opened.accountId)?.name}
          groupName={null}
          onClose={() => setOpened(null)}
          onEdit={() => {
            const target = opened
            setOpened(null)
            openEdit(target)
          }}
          onDelete={() => {
            setPendingVoid(opened)
            setOpened(null)
          }}
        />
      )}
      {pendingVoid && (
        <ConfirmDialog
          title="¿Eliminar este gasto?"
          message={
            pendingVoid.funding === 'savings'
              ? 'Lo sacamos de tus balances y del viaje, y el importe vuelve a tus ahorros. Esta acción no se puede deshacer.'
              : 'Lo sacamos de tus balances y del viaje. Esta acción no se puede deshacer.'
          }
          confirmLabel="Eliminar"
          isBusy={voidTransaction.isPending}
          onConfirm={() => void confirmVoid()}
          onCancel={() => setPendingVoid(null)}
        />
      )}
      {pendingSideVoid && (
        <ConfirmDialog
          title="¿Eliminar este gasto?"
          message={
            pendingSideVoid.funding === 'savings'
              ? 'Lo sacamos del viaje y el importe vuelve a tus ahorros. Esta acción no se puede deshacer.'
              : 'Lo sacamos del viaje. No afecta tus saldos. Esta acción no se puede deshacer.'
          }
          confirmLabel="Eliminar"
          isBusy={voidSide.isPending}
          onConfirm={() => void confirmSideVoid()}
          onCancel={() => setPendingSideVoid(null)}
        />
      )}
      {editing && (
        <PersonalTripForm
          trip={trip}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            toast.show('Viaje actualizado')
          }}
        />
      )}
      {rateFor && (
        <RateSheet
          kind={rateFor.source === 'movement' ? 'transaction' : 'side'}
          id={rateFor.id}
          title={describe(rateFor)}
          tripCurrency={currency}
          suggested={arsPerUsd}
          onClose={() => setRateFor(null)}
        />
      )}
      {expenseOpen && <TripExpenseSheet trip={{ id: trip.id, currency, funding: trip.funding }} onClose={() => setExpenseOpen(false)} />}
      {paying && (
        <TripExpenseSheet
          trip={{ id: trip.id, currency, funding: trip.funding }}
          payment={{ booking: paying.booking, pendingCents: paying.pendingCents }}
          onClose={() => setPaying(null)}
        />
      )}
      {bookingSheet && (
        <BookingSheet target={{ tripId: trip.id }} booking={bookingSheet.booking} defaultCurrency={currency} onClose={() => setBookingSheet(null)} />
      )}
      {linking && (
        <LinkExpenseSheet
          candidates={candidates}
          bookingTitle={linking.booking.title}
          onClose={() => setLinking(null)}
          onPick={async (t) => {
            try {
              await linkMovement.mutateAsync({ transactionId: t.id, bookingId: linking.booking.id, tripId: trip.id })
              toast.show('Gasto vinculado a la reserva')
              setLinking(null)
            } catch (e) {
              toast.show(toUserMessage(e), { tone: 'error' })
            }
          }}
        />
      )}
      <div data-bottom-action className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-5 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => setExpenseOpen(true)}>
          <Plus aria-hidden="true" className="mr-2 size-5" /> Cargar gasto
        </Button>
      </div>
    </Page>
  )
}
