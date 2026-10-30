import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useCategories } from '@/features/categories/api/useCategories'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatRelativeDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { MoniGlyph, Page, ProgressBar, SectionLabel } from '@/shared/ui/kit'
import { MovementRow } from '@/shared/ui/MovementRow'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { isTripsNotEnabled } from '../api/tripsRepository'
import { useTripExpenses, useTrips } from '../api/useTrips'
import { rangeLabel } from '../domain/dates'
import { summarizeTrip, tripExpenses } from '../domain/trip'
import { PersonalTripForm } from './PersonalTripForm'

// Screen 038 — Viaje personal: budget against what was really spent, and the trip's movements.
export function PersonalTripPage() {
  const { id } = useParams()
  const trips = useTrips()
  const expensesQuery = useTripExpenses()
  const categories = useCategories(undefined, { includeArchived: true })
  const { openNew, openEdit } = useMovementSheet()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const today = todayIso()

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
  const summary = summarizeTrip(trip, expenses, today)
  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const percent = Math.round(summary.progress * 100)

  return (
    <Page className="pb-28">
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
      <p className="-mt-2 text-[16px] text-text-muted">
        {rangeLabel(trip.startsOn, trip.endsOn)} · {summary.totalDays}{' '}
        {summary.totalDays === 1 ? 'día' : 'días'}
      </p>
      <section
        aria-label="Presupuesto del viaje"
        className="rounded-[28px] bg-forest p-5 text-cream"
      >
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Presupuesto del viaje
        </p>
        <p className="font-display text-[44px] font-extrabold leading-[52px]">
          {formatArs(trip.budgetCents)}
        </p>
        <div className="mt-3 flex justify-between gap-3 text-[15px] font-extrabold text-text-muted-on-dark">
          <span>Gastaste {formatArs(summary.spentCents)}</span>
          <span>{percent}%</span>
        </div>
        <ProgressBar
          value={summary.progress}
          tone="dark"
          className="mt-2"
          label="Gastado del presupuesto"
        />
        <p
          className={
            summary.overBudget
              ? 'mt-3 text-[17px] font-extrabold text-blush'
              : 'mt-3 text-[17px] font-extrabold'
          }
        >
          {summary.overBudget
            ? `Te pasaste ${formatArs(-summary.remainingCents)}`
            : `Te quedan ${formatArs(summary.remainingCents)}`}
        </p>
        {summary.perDayCents > 0 && (
          <div className="mt-3 flex gap-3 rounded-[18px] bg-surface p-4 text-[16px] leading-6">
            <MoniGlyph className="mt-0.5 shrink-0 text-lime" />
            <p>
              {summary.status === 'upcoming' ? 'Para cada uno de los ' : 'Podés gastar unos '}
              <strong className="font-extrabold">
                {summary.status === 'upcoming'
                  ? `${summary.daysLeft} días: ${formatArs(summary.perDayCents)} por día`
                  : `${formatArs(summary.perDayCents)} por día`}
              </strong>
              {summary.status === 'ongoing' &&
                ` durante los ${summary.daysLeft} ${summary.daysLeft === 1 ? 'día' : 'días'} que faltan`}
              .
            </p>
          </div>
        )}
      </section>

      {summary.byCategory.length > 0 && (
        <section className="rounded-[24px] border border-sand bg-card p-4">
          <h2 className="text-[22px] font-extrabold">En qué gastaste</h2>
          <ul className="mt-1 divide-y divide-sand">
            {summary.byCategory.map((row) => {
              const category = row.categoryId ? categoryById.get(row.categoryId) : undefined
              return (
                <li key={row.categoryId ?? 'none'} className="flex items-center gap-3 py-3">
                  <CategoryIconCircle iconName={category?.icon} color={category?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] font-extrabold">
                      {category?.name ?? 'Sin categoría'}
                    </span>
                    <span className="block text-[15px] text-text-muted">
                      {Math.round(row.share * 100)}% de lo gastado
                    </span>
                  </span>
                  <span className="text-[18px] font-extrabold">{formatArs(row.cents)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <SectionLabel>Gastos del viaje</SectionLabel>
      {expensesQuery.isLoading ? (
        <Skeleton className="h-24" />
      ) : expenses.length === 0 ? (
        <p className="rounded-[24px] border border-sand bg-card p-4 text-[16px] text-text-muted">
          Todavía no cargaste gastos de este viaje.
        </p>
      ) : (
        <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card px-4">
          {expenses.map((t) => {
            const category = t.categoryId ? categoryById.get(t.categoryId) : undefined
            return (
              <li key={t.id}>
                <MovementRow
                  leading={<CategoryIconCircle iconName={category?.icon} color={category?.color} />}
                  title={t.note?.trim() || category?.name || 'Gasto'}
                  subtitle={`${category?.name ?? 'Sin categoría'} · ${formatRelativeDay(t.occurredOn, today)}`}
                  trailing={formatArs(-t.amountCents)}
                  onPress={() => openEdit(t)}
                  pressLabel={`Editar gasto ${t.note?.trim() || category?.name || ''}`.trim()}
                />
              </li>
            )
          })}
        </ul>
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
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => openNew('expense', { tripId: trip.id })}>
          <Plus aria-hidden="true" className="mr-2 size-5" /> Cargar gasto
        </Button>
      </div>
    </Page>
  )
}
