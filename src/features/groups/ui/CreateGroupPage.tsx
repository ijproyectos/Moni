import {
  ChevronRight,
  Heart,
  House,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  Send,
  UserPlus,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { isPlusRequired, toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { Avatar, SectionLabel, SplitBar, Toggle } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import type { GroupKind } from '@/shared/lib/database.types'
import { useCreateGroup } from '../api/useGroups'
import { addGuest, DEFAULT_RECURRING, patchOverlay, type Recurring } from '../mock/overlayStore'
import { FEATURES } from '@/shared/config/features'
import { AddPersonSheet } from './AddPersonSheet'
import { InvitePanel } from './InvitePanel'
import { fieldClass } from './styles'

const OPTIONS: {
  kind: GroupKind
  title: string
  text: string
  icon: LucideIcon
  badge?: string
}[] = [
  {
    kind: 'pareja',
    title: 'Pareja',
    text: 'De a dos y siempre abierto. Moni lleva el saldo: quién puso más y cuánto te debe.',
    icon: Heart,
  },
  {
    kind: 'amigos',
    title: 'Amigos',
    text: 'Una salida, un asado, un cumple. Se divide y se cierra con un resumen.',
    icon: UsersRound,
  },
  {
    kind: 'casa',
    title: 'Casa',
    text: 'Con quienes vivís: alquiler, expensas, luz e internet. Se repite todos los meses.',
    icon: House,
  },
  {
    kind: 'viaje',
    title: 'Viaje',
    text: 'Con fechas y presupuesto. Alquiler y comidas en grupo.',
    icon: Send,
    badge: 'También en Viajes',
  },
]

// Screen 048 — ¿Con quién compartís gastos?
export function CreateGroupPage() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<GroupKind | null>(null)

  return (
    <section className="flex flex-col gap-3 px-4 pt-14">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => navigate('/grupos')}
        className="flex size-12 items-center justify-center rounded-full bg-sand"
      >
        <X aria-hidden="true" className="size-6" />
      </button>
      <h1 className="mt-3 font-display text-[34px] font-extrabold leading-[40px]">
        ¿Con quién compartís gastos?
      </h1>
      <p className="text-[17px] text-text-muted">Elegí una opción. Después sumás a la gente.</p>
      <ul className="mt-1 flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              onClick={() =>
                o.kind === 'viaje' ? navigate('/viajes?nuevo=grupo') : setKind(o.kind)
              }
              className="flex w-full items-center gap-4 rounded-[24px] border border-sand bg-card p-4 text-left"
            >
              <span className="flex size-[60px] shrink-0 items-center justify-center rounded-[18px] bg-lime/40">
                <o.icon aria-hidden="true" className="size-7" strokeWidth={2} />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2 text-[22px] font-extrabold">
                  {o.title}
                  {o.badge && (
                    <span className="rounded-full bg-lime/40 px-2.5 py-0.5 text-[13px]">
                      {o.badge}
                    </span>
                  )}
                </span>
                <span className="block text-[15px] leading-5 text-text-muted">{o.text}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-6 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
      <Link
        to="/grupos/unirse"
        className="mt-3 flex min-h-12 items-center justify-center gap-2 text-[18px] font-extrabold"
      >
        <KeyRound aria-hidden="true" className="size-5 -scale-x-100" /> Ya tengo un código
      </Link>
      {kind && <NewGroupSheet kind={kind} onClose={() => setKind(null)} />}
    </section>
  )
}

interface PendingGuest {
  name: string
  alias: string
}

const TITLES: Record<GroupKind, string> = {
  pareja: 'Gastos de pareja',
  amigos: 'Grupo de amigos',
  casa: 'Gastos de casa',
  viaje: 'Viaje en grupo',
}
const DEFAULT_NAMES: Record<GroupKind, string> = {
  pareja: 'Nosotros',
  amigos: '',
  casa: '',
  viaje: '',
}
const RECURRING_ICONS = { house: House, plug: Plug, refresh: RefreshCw }

// Screens 049 / 050 / 051 / 082 / 096 / 099 / 129 — create sheets per kind.
function NewGroupSheet({ kind, onClose }: { kind: GroupKind; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateGroup()
  const [name, setName] = useState(DEFAULT_NAMES[kind])
  const [guests, setGuests] = useState<PendingGuest[]>([])
  const [adding, setAdding] = useState(false)
  const [split, setSplit] = useState<'half' | 'income'>('half')
  const [recurring, setRecurring] = useState<Recurring[]>(DEFAULT_RECURRING)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)
  // Free plan: the server rejects a second active group; show the Plus upsell instead of an error.
  const [upsell, setUpsell] = useState(false)
  const couple = kind === 'pareja'
  const partner = guests[0]

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre al grupo.')
    try {
      const groupId = await create.mutateAsync({ name: name.trim(), kind })
      for (const g of guests) addGuest(groupId, g.name, g.alias)
      patchOverlay(groupId, {
        coupleSplit: split,
        recurring: kind === 'casa' ? recurring : [],
      })
      toast.show('Grupo creado', { mascotUrl: mascotGroup })
      // Next step: show the invite code before landing on the group.
      setCreated({ id: groupId, name: name.trim() })
    } catch (e) {
      if (isPlusRequired(e)) setUpsell(true)
      else setError(toUserMessage(e))
    }
  }

  if (upsell) return <PlusSheet reason="group" onClose={() => setUpsell(false)} />

  if (created) {
    const finish = () => {
      onClose()
      navigate(`/grupos/${created.id}`)
    }
    return (
      <BottomSheet title="Invitá a la gente" onClose={finish}>
        <InvitePanel groupId={created.id} groupName={created.name} onDone={finish} />
      </BottomSheet>
    )
  }

  if (adding) {
    return (
      <AddPersonSheet
        title={couple ? 'Invitar a tu pareja' : 'Sumar persona'}
        code={null}
        groupName={name}
        feminine={couple}
        onClose={() => setAdding(false)}
        onAddGuest={(n, a) =>
          setGuests((list) => (couple ? [{ name: n, alias: a }] : [...list, { name: n, alias: a }]))
        }
      />
    )
  }

  return (
    <BottomSheet title={TITLES[kind]} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre"
          maxLength={60}
          placeholder={kind === 'casa' ? 'Ej: Depto Palermo' : 'Ej: Asado del viernes'}
          className={fieldClass}
        />

        {couple ? (
          <>
            <SectionLabel className="mt-1">Tu pareja</SectionLabel>
            <div className="rounded-[24px] border border-sand bg-card p-4">
              {partner ? (
                <div className="flex items-center gap-3">
                  <Avatar name={partner.name} />
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">{partner.name}</span>
                    <span className="block text-[14px] text-text-muted">
                      No tiene Moni · lo cargás vos
                    </span>
                  </span>
                  <span className="rounded-full bg-gold/40 px-3 py-0.5 text-[13px] font-extrabold">
                    Sin Moni
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-full bg-blush/60">
                    <UserPlus aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">Tu pareja</span>
                    <span className="block text-[14px] text-text-muted">
                      Le mandás el código y se une
                    </span>
                  </span>
                  <span className="rounded-full bg-gold/40 px-3 py-0.5 text-[13px] font-extrabold">
                    Pendiente
                  </span>
                </div>
              )}
              {FEATURES.groupGuestsAndSimulatedSplits && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-sand text-[16px] font-extrabold"
                >
                  {partner ? 'Cambiar' : 'Invitarla o sumarla sin Moni'}{' '}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
            {FEATURES.groupGuestsAndSimulatedSplits ? (
              <>
                <SectionLabel className="mt-1">¿Cómo dividen?</SectionLabel>
                <SegmentedControl
                  label="Cómo dividen"
                  value={split}
                  onChange={setSplit}
                  options={[
                    { value: 'half', label: '50/50' },
                    { value: 'income', label: 'Según ingresos' },
                  ]}
                />
                {split === 'income' ? (
                  <div className="rounded-[20px] border border-sand bg-card p-4">
                    <div className="flex justify-between text-[17px] font-extrabold">
                      <span>Vos 60 %</span>
                      <span>{partner?.name ?? 'Tu pareja'} 40 %</span>
                    </div>
                    <SplitBar share={0.6} rest="blush" className="mt-2" />
                    <p className="mt-2 text-[14px] leading-5 text-text-muted">
                      Se calcula con los ingresos que cargó cada uno. Cada uno ve solo el
                      porcentaje.
                    </p>
                  </div>
                ) : (
                  <p className="text-[15px] leading-5 text-text-muted">
                    Cada gasto que carguen se suma al saldo. Cuando quieran, saldan cuentas.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[15px] leading-5 text-text-muted">
                Cada gasto que carguen se suma al saldo. Cuando quieran, saldan cuentas.
              </p>
            )}
          </>
        ) : (
          <>
            <SectionLabel className="mt-1">
              {kind === 'casa' ? 'Quiénes viven' : 'Quiénes están'}
            </SectionLabel>
            <div className="rounded-[24px] border border-sand bg-card px-4 py-2">
              <ul className="divide-y divide-sand">
                <li className="flex items-center gap-3 py-2">
                  <Avatar name="Vos" />
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">Vos</span>
                    <span className="block text-[14px] text-text-muted">Tiene Moni</span>
                  </span>
                  <span className="rounded-full bg-sand px-3 py-0.5 text-[13px] font-extrabold">
                    Vos
                  </span>
                </li>
                {guests.map((g) => (
                  <li key={g.name} className="flex items-center gap-3 py-2">
                    <Avatar name={g.name} />
                    <span className="flex-1">
                      <span className="block text-[18px] font-extrabold">{g.name}</span>
                      <span className="block text-[14px] text-text-muted">
                        No tiene Moni · lo cargás vos
                      </span>
                    </span>
                    <span className="rounded-full bg-gold/40 px-3 py-0.5 text-[13px] font-extrabold">
                      Sin Moni
                    </span>
                  </li>
                ))}
              </ul>
              {FEATURES.groupGuestsAndSimulatedSplits && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="my-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-line text-[17px] font-extrabold"
                >
                  <Plus aria-hidden="true" className="size-5" /> Agregar persona
                </button>
              )}
            </div>
            {kind === 'casa' && recurring.length > 0 && (
              <>
                <SectionLabel className="mt-1">Gastos que se repiten cada mes</SectionLabel>
                <RecurringList items={recurring} onChange={setRecurring} />
              </>
            )}
            <p className="text-[15px] leading-5 text-text-muted">
              {FEATURES.groupGuestsAndSimulatedSplits
                ? 'Los que tienen Moni ven el grupo desde su app. A los que no, los sumás con el nombre y se cuentan igual.'
                : 'Cuando crees el grupo te damos un código para que se sumen los que tienen Moni.'}
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={create.isPending}>
          {create.isPending ? 'Creando…' : kind === 'amigos' ? 'Crear grupo' : 'Crear'}
        </Button>
      </div>
    </BottomSheet>
  )
}

export function RecurringList({
  items,
  onChange,
}: {
  items: Recurring[]
  onChange: (items: Recurring[]) => void
}) {
  return (
    <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card px-4">
      {items.map((r) => {
        const Icon = RECURRING_ICONS[r.icon]
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <span className="flex size-11 items-center justify-center rounded-full bg-lime/35">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-extrabold">{r.name}</span>
              <span className="block text-[14px] text-text-muted">Todos los {r.day}</span>
            </span>
            <Toggle
              label={r.name}
              checked={r.enabled}
              onChange={(enabled) =>
                onChange(items.map((x) => (x.id === r.id ? { ...x, enabled } : x)))
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
