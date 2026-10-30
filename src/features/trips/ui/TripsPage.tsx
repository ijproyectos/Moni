import { ChevronRight, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { useMyGroups } from '@/features/groups/api/useGroups'
import { overlayDeltaFor } from '@/features/groups/domain/ledger'
import { useOverlays } from '@/features/groups/mock/overlayStore'
import { AvatarStack } from '@/features/groups/ui/groupVisuals'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { HeaderAddButton, Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { isTripsNotEnabled } from '../api/tripsRepository'
import { useGroupTrips, useTrips, useTripExpenses } from '../api/useTrips'
import { rangeLabel } from '../domain/dates'
import { summarizeTrip, tripExpenses } from '../domain/trip'
import { NewTripSheet, type NewTripStart } from './NewTripSheet'
import { PersonalTripCard } from './TripCards'

type Tab = 'personal' | 'group'

const TABS = [
  { value: 'personal', label: 'Mis viajes' },
  { value: 'group', label: 'En grupo' },
] as const

// Screen 036 — Viajes: personal trips ("Mis viajes") and shared ones ("En grupo", real groups).
export function TripsPage() {
  const [params, setParams] = useSearchParams()
  const creating = params.get('nuevo')
  const [tab, setTab] = useState<Tab>(creating === 'grupo' ? 'group' : 'personal')

  return (
    <Page>
      <PageHeader
        title="Viajes"
        action={
          <HeaderAddButton label="Nuevo viaje" onClick={() => setParams({ nuevo: 'elegir' })} />
        }
      />
      <p className="-mt-2 text-[16px] text-text-muted">
        Organizá tus viajes y llevá tus gastos al día
      </p>
      <SegmentedControl label="Tipo de viajes" value={tab} onChange={setTab} options={TABS} />
      {tab === 'personal' ? (
        <PersonalTrips onNew={() => setParams({ nuevo: 'personal' })} />
      ) : (
        <GroupTrips onNew={() => setParams({ nuevo: 'grupo' })} />
      )}
      {creating && (
        <NewTripSheet
          start={
            (creating === 'personal' || creating === 'grupo' ? creating : 'elegir') as NewTripStart
          }
          onClose={() => setParams({}, { replace: true })}
          onKindChosen={(kind) => setTab(kind === 'grupo' ? 'group' : 'personal')}
        />
      )}
    </Page>
  )
}

function PersonalTrips({ onNew }: { onNew: () => void }) {
  const trips = useTrips()
  const expenses = useTripExpenses()
  const today = todayIso()

  if (trips.isLoading) {
    return (
      <div role="status" aria-label="Cargando tus viajes" className="flex flex-col gap-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    )
  }
  if (trips.isError) {
    return isTripsNotEnabled(trips.error) ? (
      <EmptyState
        mascotUrl={mascotUrl}
        title="Estamos preparando tus viajes"
        description="Los viajes personales todavía no están disponibles en tu cuenta. Probá de nuevo más tarde."
      />
    ) : (
      <EmptyState
        mascotUrl={mascotUrl}
        title="No pudimos cargar tus viajes"
        description="Revisá tu conexión y probá de nuevo."
        action={<Button onClick={() => void trips.refetch()}>Reintentar</Button>}
      />
    )
  }

  const all = trips.data ?? []
  if (all.length === 0) {
    return (
      <EmptyState
        mascotUrl={mascotUrl}
        title="Todavía no tenés viajes"
        description="Armá uno con su presupuesto y andá cargando lo que gastás."
        action={<Button onClick={onNew}>Crear viaje personal</Button>}
      />
    )
  }

  const cards = all.map((trip) => ({
    trip,
    summary: summarizeTrip(trip, tripExpenses(trip.id, expenses.data ?? []), today),
  }))
  const current = cards.filter((c) => c.summary.status !== 'ended' && !c.trip.archivedAt)
  const past = cards
    .filter((c) => c.summary.status === 'ended' || c.trip.archivedAt)
    .sort((a, b) => (a.trip.endsOn < b.trip.endsOn ? 1 : -1))

  return (
    <>
      {current.map((c) => (
        <PersonalTripCard key={c.trip.id} trip={c.trip} summary={c.summary} today={today} />
      ))}
      {past.length > 0 && (
        <>
          <h2 className="mt-2 text-[22px] font-extrabold">Pasados</h2>
          {past.map((c) => (
            <PersonalTripCard key={c.trip.id} trip={c.trip} summary={c.summary} today={today} />
          ))}
        </>
      )}
    </>
  )
}

function GroupTrips({ onNew }: { onNew: () => void }) {
  const groups = useMyGroups()
  const groupTrips = useGroupTrips()
  const overlays = useOverlays()
  const { user } = useAuth()

  if (groups.isLoading) {
    return (
      <div role="status" aria-label="Cargando tus viajes en grupo" className="flex flex-col gap-3">
        <Skeleton className="h-44" />
      </div>
    )
  }
  // Every group of kind "viaje" is a trip (as before), and so is any group that was given trip dates.
  const infoByGroup = new Map((groupTrips.data ?? []).map((t) => [t.groupId, t]))
  const trips = (groups.data ?? []).filter(
    (g) => (g.kind === 'viaje' || infoByGroup.has(g.id)) && !overlays[g.id]?.deleted,
  )

  if (trips.length === 0) {
    return (
      <EmptyState
        mascotUrl={mascotUrl}
        title="Todavía no tenés viajes en grupo"
        description="Armá uno con un grupo nuevo o sumá un grupo que ya tengas."
        action={<Button onClick={onNew}>Crear viaje en grupo</Button>}
      />
    )
  }

  return (
    <>
      {trips.map((g) => {
        const overlay = overlays[g.id]
        const info = infoByGroup.get(g.id)
        const net = g.myNetCents + overlayDeltaFor(overlay, user?.id ?? '')
        return (
          <Link
            key={g.id}
            to={`/grupos/${g.id}`}
            className="block rounded-[28px] border border-sand bg-card p-5"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-lime/40 px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em]">
                En grupo
              </span>
              {info && (
                <span className="text-[15px] font-extrabold">
                  {rangeLabel(info.startsOn, info.endsOn)}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lime/40">
                <Send aria-hidden="true" className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block break-words font-display text-[26px] font-extrabold leading-8">
                  {overlay?.name ?? g.name}
                </span>
                <span className="block text-[15px] text-text-muted">
                  {g.memberCount + (overlay?.guests.length ?? 0)} personas
                  {info && ` · Presupuesto ${formatArs(info.budgetCents)}`}
                </span>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <AvatarStack people={[{ name: 'Vos' }, ...(overlay?.guests ?? [])]} />
              <span className="flex items-center gap-1 text-[16px] font-extrabold">
                {net > 0
                  ? `Te deben ${formatArs(net)}`
                  : net < 0
                    ? `Debés ${formatArs(-net)}`
                    : 'Estás al día'}
                <ChevronRight aria-hidden="true" className="size-5" />
              </span>
            </div>
          </Link>
        )
      })}
    </>
  )
}
