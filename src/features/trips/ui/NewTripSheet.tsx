import { User, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateGroup, useMyGroups } from '@/features/groups/api/useGroups'
import { useOverlays } from '@/features/groups/mock/overlayStore'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip, SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useGroupTrips, useSetGroupTrip } from '../api/useTrips'
import { defaultTripDates, tripFormSchema } from '../domain/trip'
import { PersonalTripForm } from './PersonalTripForm'
import { TripDatePicker, TripDatesBudget, tripFieldClass } from './TripFormParts'

export type NewTripStart = 'elegir' | 'personal' | 'grupo'

/**
 * "Nuevo viaje": first the kind (personal or group), then the form of that kind. A personal trip asks for destination,
 * dates and budget (no guests, no invitations). A group trip uses the real Grupos: an existing group or a new one
 * (created with the usual group flow), plus the dates and the budget of the trip. Invitations stay in the group.
 */
export function NewTripSheet({
  start,
  onClose,
  onKindChosen,
}: {
  start: NewTripStart
  onClose: () => void
  onKindChosen: (kind: 'personal' | 'grupo') => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState<NewTripStart>(start)
  if (step === 'elegir') {
    return (
      <ChooserWithClose
        onClose={onClose}
        onChoose={(kind) => {
          setStep(kind)
          onKindChosen(kind)
        }}
      />
    )
  }
  if (step === 'personal') {
    return (
      <PersonalTripForm
        onClose={onClose}
        onSaved={(trip) => {
          toast.show('Viaje creado')
          navigate(`/viajes/${trip.id}`)
        }}
      />
    )
  }
  return <GroupTripForm onClose={onClose} />
}

function ChooserWithClose({
  onClose,
  onChoose,
}: {
  onClose: () => void
  onChoose: (kind: 'personal' | 'grupo') => void
}) {
  return (
    <BottomSheet title="Nuevo viaje" onClose={onClose}>
      <KindOptions onChoose={onChoose} />
    </BottomSheet>
  )
}

function KindOptions({ onChoose }: { onChoose: (kind: 'personal' | 'grupo') => void }) {
  const options = [
    {
      kind: 'personal',
      icon: User,
      title: 'Viaje personal',
      text: 'Es solo tuyo: destino, fechas y presupuesto, y llevás tus gastos al día.',
    },
    {
      kind: 'grupo',
      icon: UsersRound,
      title: 'Viaje en grupo',
      text: 'Con un grupo de Moni: gastos compartidos y quién le debe a quién.',
    },
  ] as const
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => (
        <button
          key={o.kind}
          type="button"
          onClick={() => onChoose(o.kind)}
          className="flex items-center gap-4 rounded-[24px] border-2 border-sand bg-card p-4 text-left transition active:scale-[0.99]"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lime text-forest">
            <o.icon aria-hidden="true" className="size-6" />
          </span>
          <span>
            <span className="block text-[20px] font-extrabold">{o.title}</span>
            <span className="block text-[15px] leading-5 text-text-muted">{o.text}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** A group trip: the dates and budget of a group (an existing one the person created, or a new one). */
function GroupTripForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayIso()
  const createGroup = useCreateGroup()
  const setGroupTrip = useSetGroupTrip()
  const groups = useMyGroups()
  const groupTrips = useGroupTrips()
  const overlays = useOverlays()

  const defaults = defaultTripDates(today)
  const [name, setName] = useState('')
  const [dates, setDates] = useState({ startsOn: defaults.startsOn, endsOn: defaults.endsOn })
  const [budgetText, setBudgetText] = useState('')
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'existing' | 'new'>('existing')
  const [groupId, setGroupId] = useState<string | null>(null)

  // Only the creator / owner of a group can set its trip (the server enforces it too), so those are the groups on offer;
  // the ones that already have trip dates are not offered again.
  const withTrip = new Set((groupTrips.data ?? []).map((t) => t.groupId))
  const available = (groups.data ?? []).filter(
    (g) => g.role === 'owner' && !withTrip.has(g.id) && !overlays[g.id]?.deleted,
  )
  const effectiveSource = available.length === 0 ? 'new' : source
  const budgetCents = Math.max(0, parseAmountInput(budgetText) ?? 0)
  const busy = createGroup.isPending || setGroupTrip.isPending

  async function submit() {
    setError(null)
    if (effectiveSource === 'existing' && !groupId) return setError('Elegí el grupo del viaje.')
    const result = tripFormSchema.safeParse({
      name: effectiveSource === 'new' ? name : 'grupo',
      ...dates,
      budget: budgetText,
    })
    if (!result.success) return setError(result.error.issues[0]?.message ?? 'Revisá los datos.')
    try {
      const targetId =
        effectiveSource === 'new'
          ? await createGroup.mutateAsync({ name: result.data.name, kind: 'viaje' })
          : (groupId as string)
      await setGroupTrip.mutateAsync({ groupId: targetId, values: result.data })
      toast.show('Viaje creado')
      navigate(`/grupos/${targetId}`)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (picking) {
    return (
      <TripDatePicker
        picking={picking}
        {...dates}
        min={today}
        onClose={() => setPicking(null)}
        onChange={(next) => {
          setDates(next)
          setPicking(null)
        }}
      />
    )
  }

  return (
    <BottomSheet title="Viaje en grupo" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {available.length > 0 && (
          <SegmentedControl
            label="Grupo del viaje"
            value={effectiveSource}
            onChange={setSource}
            options={[
              { value: 'existing', label: 'Grupo existente' },
              { value: 'new', label: 'Grupo nuevo' },
            ]}
          />
        )}
        {effectiveSource === 'existing' ? (
          <>
            <SectionLabel>¿Con qué grupo viajás?</SectionLabel>
            <div role="group" aria-label="Tus grupos" className="flex flex-col gap-2">
              {available.map((g) => (
                <ChoiceChip
                  key={g.id}
                  selected={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                  className="min-h-12 justify-start px-4"
                >
                  <span className="min-w-0 truncate">{overlays[g.id]?.name ?? g.name}</span>
                  <span className="ml-auto shrink-0 text-[14px] font-bold opacity-70">
                    {g.memberCount} {g.memberCount === 1 ? 'persona' : 'personas'}
                  </span>
                </ChoiceChip>
              ))}
            </div>
            <p className="text-[14px] leading-5 text-text-muted">
              Solo quien creó el grupo puede definir sus fechas y su presupuesto.
            </p>
          </>
        ) : (
          <>
            <SectionLabel>¿A dónde van?</SectionLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nombre del viaje"
              maxLength={60}
              placeholder="Ej: Viaje a Brasil"
              className={tripFieldClass}
            />
            <p className="text-[14px] leading-5 text-text-muted">
              Se crea un grupo nuevo. Después invitás a la gente con el código del grupo.
            </p>
          </>
        )}
        <TripDatesBudget
          {...dates}
          budgetText={budgetText}
          budgetLabel="Presupuesto del grupo"
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
          {busy ? 'Creando…' : 'Crear viaje'}
        </Button>
      </div>
    </BottomSheet>
  )
}
