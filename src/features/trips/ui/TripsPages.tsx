import {
  BusFront,
  CalendarDays,
  ChevronRight,
  House,
  MapPin,
  Plus,
  Send,
  Target,
  Utensils,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { monthsUntil, roundUpSuggestion } from '@/features/goals/domain/goals'
import { useCreateGroup, useMyGroups } from '@/features/groups/api/useGroups'
import { overlayDeltaFor } from '@/features/groups/domain/ledger'
import { addGuest, patchOverlay, useOverlays } from '@/features/groups/mock/overlayStore'
import { AddPersonSheet } from '@/features/groups/ui/AddPersonSheet'
import { AvatarStack } from '@/features/groups/ui/groupVisuals'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { addDays, todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import {
  HeaderAddButton,
  IconTile,
  MoniCalcCard,
  MoniGlyph,
  Page,
  ProgressBar,
  SectionLabel,
  Toggle,
} from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { daysBetween, MONTHS, rangeLabel } from '../domain/dates'
import { addSoloTrip, addTripSpending, useSoloTrip, useTrips } from '../mock/tripsStore'

// Screen 036 — Viajes.
export function TripsPage() {
  const trips = useTrips()
  const groups = useMyGroups()
  const overlays = useOverlays()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const creating = params.get('nuevo')
  const today = todayIso()
  const groupTrips = (groups.data ?? []).filter(
    (g) => g.kind === 'viaje' && !overlays[g.id]?.deleted,
  )

  return (
    <Page>
      <PageHeader
        title="Viajes"
        action={
          <HeaderAddButton label="Nuevo viaje" onClick={() => setParams({ nuevo: 'solo' })} />
        }
      />
      <p className="-mt-2 text-[16px] text-text-muted">
        Para vos solo, o en grupo con gastos compartidos.
      </p>
      {trips.solo.map((t) => (
        <Link
          key={t.id}
          to={`/viajes/${t.id}`}
          className="block rounded-[28px] bg-forest p-5 text-cream"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-surface px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em] text-lime">
              Solo yo
            </span>
            <span className="text-[15px] font-extrabold text-text-muted-on-dark">
              {t.from > today ? `Faltan ${daysBetween(today, t.from) - 1} días` : 'En curso'}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-full bg-lime text-forest">
              <Send aria-hidden="true" className="size-6" />
            </span>
            <span>
              <span className="block font-display text-[28px] font-extrabold leading-8">
                {t.name}
              </span>
              <span className="block text-[15px] text-text-muted-on-dark">
                {rangeLabel(t.from, t.to)} · {daysBetween(t.from, t.to)} días
              </span>
            </span>
          </div>
          <div className="mt-4 flex justify-between text-[15px] font-extrabold text-text-muted-on-dark">
            <span>Presupuesto {formatArs(t.budgetCents)}</span>
            <span>Ahorrado {formatArs(t.savedCents)}</span>
          </div>
          <ProgressBar value={t.savedCents / t.budgetCents} tone="dark" className="mt-2" />
        </Link>
      ))}
      {groupTrips.map((g) => {
        const overlay = overlays[g.id]
        const net = g.myNetCents + overlayDeltaFor(overlay, user?.id ?? '')
        return (
          <Link
            key={g.id}
            to={`/grupos/${g.id}`}
            className="block rounded-[28px] border border-sand bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-lime/40 px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em]">
                En grupo
              </span>
              {overlay?.trip && (
                <span className="text-[15px] font-extrabold">
                  {rangeLabel(overlay.trip.from, overlay.trip.to)}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex size-14 items-center justify-center rounded-full bg-lime/40">
                <Send aria-hidden="true" className="size-6" />
              </span>
              <span>
                <span className="block font-display text-[26px] font-extrabold leading-8">
                  {overlay?.name ?? g.name}
                </span>
                <span className="block text-[15px] text-text-muted">
                  {g.memberCount + (overlay?.guests.length ?? 0)} personas
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
      {trips.past.length > 0 && (
        <>
          <h2 className="mt-2 text-[22px] font-extrabold">Pasados</h2>
          {trips.past.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-4"
            >
              <IconTile icon={Send} bg="#e3f2cf" />
              <span className="flex-1">
                <span className="block text-[18px] font-extrabold">{p.name}</span>
                <span className="block text-[15px] text-text-muted">{p.label}</span>
              </span>
              <span className="text-right">
                <span className="block text-[14px] text-text-muted">Tu parte</span>
                <span className="block text-[19px] font-extrabold">
                  {formatArs(p.myShareCents)}
                </span>
              </span>
            </div>
          ))}
        </>
      )}
      {creating && (
        <NewTripSheet
          initialMode={creating === 'grupo' ? 'group' : 'solo'}
          onClose={() => setParams({}, { replace: true })}
        />
      )}
    </Page>
  )
}

// Screens 037 / 039 / 102 — Nuevo viaje.
function NewTripSheet({
  initialMode,
  onClose,
}: {
  initialMode: 'solo' | 'group'
  onClose: () => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const createGroup = useCreateGroup()
  const today = todayIso()
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [from, setFrom] = useState(addDays(today, 30))
  const [to, setTo] = useState(addDays(today, 34))
  const [budgetText, setBudgetText] = useState('')
  const [saving, setSaving] = useState(true)
  const [guests, setGuests] = useState<{ name: string; alias: string }[]>([])
  const [picking, setPicking] = useState<null | 'from' | 'to' | 'people'>(null)
  const [error, setError] = useState<string | null>(null)
  const budget = parseAmountInput(budgetText) ?? 0
  const days = Math.max(1, daysBetween(from, to))
  const monthsLeft = monthsUntil(today, from)
  const people = guests.length + 1

  async function create() {
    setError(null)
    if (!name.trim()) return setError('Contanos a dónde vas.')
    if (budget <= 0) return setError('Poné un presupuesto.')
    if (mode === 'solo') {
      const trip = addSoloTrip({ name: name.trim(), from, to, budgetCents: budget, saving })
      toast.show('Viaje creado')
      navigate(`/viajes/${trip.id}`)
      return
    }
    try {
      const groupId = await createGroup.mutateAsync({ name: name.trim(), kind: 'viaje' })
      for (const g of guests) addGuest(groupId, g.name, g.alias)
      patchOverlay(groupId, { trip: { from, to, budgetCents: budget } })
      toast.show('Viaje creado')
      navigate(`/grupos/${groupId}`)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (picking === 'from' || picking === 'to') {
    return (
      <DatePickerSheet
        title={picking === 'from' ? '¿Cuándo salís?' : '¿Cuándo volvés?'}
        value={picking === 'from' ? from : to}
        min={picking === 'from' ? today : from}
        onClose={() => setPicking(null)}
        onConfirm={(d) => {
          if (picking === 'from') {
            setFrom(d)
            if (to < d) setTo(d)
          } else setTo(d)
          setPicking(null)
        }}
      />
    )
  }
  if (picking === 'people') {
    return (
      <AddPersonSheet
        title="Sumar al viaje"
        code={null}
        groupName={name}
        onClose={() => setPicking(null)}
        onAddGuest={(n, a) => setGuests((g) => [...g, { name: n, alias: a }])}
      />
    )
  }

  return (
    <BottomSheet title="Nuevo viaje" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label="Tipo de viaje"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'solo', label: 'Solo yo' },
            { value: 'group', label: 'Con grupo' },
          ]}
        />
        <SectionLabel>¿A dónde vas?</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Destino"
          maxLength={60}
          placeholder="Ej: Semana en Salta"
          className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px] placeholder:text-text-muted"
        />
        <div className="grid grid-cols-2 gap-2">
          {(['from', 'to'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPicking(k)}
              aria-label={k === 'from' ? 'Fecha de ida' : 'Fecha de vuelta'}
              className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-white px-4 text-[17px] font-extrabold"
            >
              <CalendarDays aria-hidden="true" className="size-5" />{' '}
              {formatDayMonth(k === 'from' ? from : to).replace(' ', ' de ')}
            </button>
          ))}
        </div>
        <SectionLabel>
          {mode === 'solo' ? 'Presupuesto para vos' : 'Presupuesto del grupo'}
        </SectionLabel>
        <AmountInput
          aria-label="Presupuesto"
          value={budgetText}
          onChange={(e) => setBudgetText(e.target.value)}
        />
        {mode === 'solo' ? (
          <div className="flex items-center gap-3 rounded-[20px] border border-sand bg-white px-4 py-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-gold/40">
              <MoniGlyph className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-extrabold">Ahorrar para este viaje</span>
              <span className="block text-[14px] text-text-muted">Moni te dice cuánto guardar</span>
            </span>
            <Toggle label="Ahorrar para este viaje" checked={saving} onChange={setSaving} />
          </div>
        ) : (
          <div className="rounded-[22px] border border-sand bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-extrabold">Quiénes van</span>
              <AvatarStack people={[{ name: 'Vos' }, ...guests]} />
            </div>
            <p className="mt-1 text-[15px] leading-5 text-text-muted">
              Armamos el grupo para dividir alquiler, comida y lo que sea. Compartiles el código de
              invitación.
            </p>
            <button
              type="button"
              onClick={() => setPicking('people')}
              className="mt-3 flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-[#d9c9a6] px-4 text-[16px] font-extrabold"
            >
              <Plus aria-hidden="true" className="size-4" /> Invitar
            </button>
          </div>
        )}
        {budget > 0 && (
          <MoniCalcCard
            mascot={mascotUrl}
            title={
              mode === 'solo'
                ? `Unos ${formatArs(Math.round(budget / days / 100) * 100)} por día`
                : `${formatArs(Math.round(budget / people / 100) * 100)} por persona`
            }
          >
            {mode === 'solo'
              ? `${days} días.${saving ? ` Ahorrá ${formatArs(roundUpSuggestion(budget / monthsLeft))} por mes hasta ${MONTHS[Number(from.slice(5, 7)) - 1]}.` : ''}`
              : `entre ${people}, para el presupuesto del grupo`}
          </MoniCalcCard>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void create()} disabled={createGroup.isPending}>
          {createGroup.isPending ? 'Creando…' : 'Crear viaje'}
        </Button>
      </div>
    </BottomSheet>
  )
}

const ITEM_ICONS = {
  house: { icon: House, bg: '#d9ebe4' },
  food: { icon: Utensils, bg: '#fbdcd7' },
  bus: { icon: BusFront, bg: '#d9ebe4' },
  pin: { icon: MapPin, bg: '#fdeab8' },
}

// Screen 038 — Viaje solo.
export function SoloTripPage() {
  const { id } = useParams()
  const trip = useSoloTrip(id)
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  if (!trip) {
    return (
      <Page>
        <PageHeader title="Viaje" backTo="/viajes" />
        <p>No encontramos este viaje.</p>
      </Page>
    )
  }
  const days = daysBetween(trip.from, trip.to)
  const today = todayIso()
  const weeks = Math.max(1, Math.ceil(daysBetween(today, trip.from) / 7))
  const perWeek = roundUpSuggestion(Math.max(0, trip.budgetCents - trip.savedCents) / weeks)
  return (
    <Page>
      <PageHeader
        title={trip.name}
        backTo="/viajes"
        action={
          <span className="rounded-full bg-sand px-4 py-2 text-[15px] font-extrabold">
            {rangeLabel(trip.from, trip.to)}
          </span>
        }
      />
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Presupuesto del viaje
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[44px] font-extrabold leading-[52px]">
            {formatArs(trip.budgetCents)}
          </span>
          <span className="text-[16px] text-text-muted-on-dark">
            unos {formatArs(Math.round(trip.budgetCents / days / 100) * 100)} por día
          </span>
        </p>
        <div className="mt-3 flex justify-between text-[15px] font-extrabold text-text-muted-on-dark">
          <span>Ahorraste {formatArs(trip.savedCents)}</span>
          <span>{Math.round((trip.savedCents / trip.budgetCents) * 100)}%</span>
        </div>
        <ProgressBar value={trip.savedCents / trip.budgetCents} tone="dark" className="mt-2" />
        <div className="mt-4 flex gap-3 rounded-[18px] bg-surface p-4 text-[16px] leading-6">
          <MoniGlyph className="mt-0.5 text-lime" />
          <p>
            <strong className="font-extrabold">Moni dice:</strong> ahorrá {formatArs(perWeek)} por
            semana durante {weeks} semanas y llegás.
          </p>
        </div>
      </section>
      <section className="rounded-[24px] border border-sand bg-white p-4">
        <h2 className="text-[22px] font-extrabold">Presupuesto por rubro</h2>
        <ul className="mt-1 divide-y divide-sand">
          {trip.items.map((it) => {
            const v = ITEM_ICONS[it.icon]
            return (
              <li key={it.name} className="flex items-center gap-3 py-3">
                <IconTile icon={v.icon} bg={v.bg} />
                <span className="flex-1">
                  <span className="block text-[18px] font-extrabold">{it.name}</span>
                  <span className="block text-[15px] text-text-muted">
                    {Math.round(it.share * 100)}% del presupuesto
                  </span>
                </span>
                <span className="text-[18px] font-extrabold">
                  {formatArs(Math.round((trip.budgetCents * it.share) / 100) * 100)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
      {trip.spentCents > 0 && (
        <p className="px-1 text-[16px]">
          Llevás gastado <strong className="font-extrabold">{formatArs(trip.spentCents)}</strong> de{' '}
          {formatArs(trip.budgetCents)}.
        </p>
      )}
      <div className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-4">
        <span className="flex size-12 items-center justify-center rounded-full bg-lime text-[18px] font-extrabold">
          <Target aria-hidden="true" className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block text-[18px] font-extrabold">Viaje solo para vos</span>
          <span className="block text-[15px] leading-5 text-text-muted">
            Cargá lo que gastes y lo comparamos
          </span>
        </span>
        <button
          type="button"
          onClick={() => setLoading(true)}
          className="flex min-h-11 items-center gap-1 rounded-full bg-lime px-4 text-[16px] font-extrabold"
        >
          <Plus aria-hidden="true" className="size-4" /> Cargar
        </button>
      </div>
      {loading && (
        <BottomSheet title="Gasto del viaje" onClose={() => setLoading(false)}>
          <AmountInput aria-label="Monto" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            className="mt-4"
            onClick={() => {
              const cents = parseAmountInput(text) ?? 0
              if (cents > 0) {
                addTripSpending(trip.id, cents)
                toast.show('Gasto del viaje cargado')
              }
              setText('')
              setLoading(false)
            }}
          >
            Guardar
          </Button>
        </BottomSheet>
      )}
    </Page>
  )
}
