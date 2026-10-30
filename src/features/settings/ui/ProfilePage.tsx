import {
  Banknote,
  Bell,
  Camera,
  ChevronLeft,
  CreditCard,
  Images,
  LogOut,
  Shapes,
  ShoppingBasket,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { signOut } from '@/features/auth/api/authActions'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { useUpdateProfile } from '@/features/auth/api/useUpdateProfile'
import { displayNameSchema, firstName, initialOf } from '@/features/auth/domain/profile'
import {
  updateWeeklyDigest,
  useWeeklyDigestSettings,
} from '@/features/insights/mock/digestSettings'
import { useUpdateGoals } from '@/features/onboarding/api/useGoals'
import {
  GOAL_OPTIONS,
  goalsForSelector,
  goalsToPersist,
  sanitizeGoals,
  toggleGoal,
} from '@/features/onboarding/domain/goals'
import { loadLocalPreferences } from '@/features/onboarding/domain/localPreferences'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { AppVersion } from '@/shared/ui/AppVersion'
import { Button } from '@/shared/ui/Button'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import {
  CheckDot,
  IconTile,
  MoniGlyph,
  MoniSays,
  OptionRow,
  Page,
  SectionLabel,
  Toggle,
} from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { FEATURES } from '@/shared/config/features'
import { updateProfileExtras, useProfileExtras } from '../mock/profileExtrasStore'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Sheet = 'edit' | 'income' | 'goals' | 'signout' | 'delete' | null

function ProfilePhoto({
  url,
  initial,
  size,
  onCamera,
}: {
  url: string | null
  initial: string
  size: 'lg' | 'md'
  onCamera: () => void
}) {
  const box = size === 'lg' ? 'size-[110px] text-[48px]' : 'size-[100px] text-[44px]'
  return (
    <div className="relative mx-auto w-fit">
      {url ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className={`${box} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`${box} flex items-center justify-center rounded-full bg-lime font-display font-extrabold text-forest`}
        >
          {initial}
        </span>
      )}
      <button
        type="button"
        onClick={onCamera}
        aria-label="Cambiar foto"
        className="absolute -bottom-1 -right-1 flex size-10 items-center justify-center rounded-full border-4 border-canvas bg-forest text-cream"
      >
        <Camera aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

// Perfil screens 001-005 — name and sign out are real; photo, income and account deletion are simulated.
export function ProfilePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const accounts = useAccounts()
  const extras = useProfileExtras()
  const weekly = useWeeklyDigestSettings()
  const toast = useToast()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const queryClient = useQueryClient()

  const saved = profile?.display_name ?? ''
  const shortName = firstName(saved) || user?.email?.split('@')[0] || 'Vos'
  const initial = initialOf(saved, user?.email ?? '')
  const photo = extras.photoRemoved ? null : (extras.localPhotoUrl ?? profile?.avatar_url ?? null)
  const createdAt = (profile as { created_at?: string } | undefined)?.created_at
  const since = createdAt
    ? `Desde ${MONTHS[Number(createdAt.slice(5, 7)) - 1]} ${createdAt.slice(0, 4)}`
    : null
  const accountCount = accounts.data?.length ?? 0
  const localPrefs = user ? loadLocalPreferences(user.id) : null
  const usesUsd = (profile?.secondary_currency ?? localPrefs?.secondaryCurrency) === 'USD'
  const goalCount = sanitizeGoals(profile?.goals).length

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut(queryClient)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setIsSigningOut(false)
    }
  }

  return (
    <Page className="pb-10">
      <PageHeader title="Perfil" backTo="/mas" />

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : isError ? (
        <p role="alert" className="text-center text-expense">
          No pudimos cargar tu perfil.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <ProfilePhoto url={photo} initial={initial} size="lg" onCamera={() => setSheet('edit')} />
          <h2 className="mt-3 font-display text-[30px] font-extrabold leading-9">{shortName}</h2>
          {user?.email && <p className="text-[16px] text-text-muted">{user.email}</p>}
          <div className="mt-1 flex gap-2">
            <span className="rounded-full bg-sand px-3 py-1 text-[14px] font-extrabold">
              Plan gratis
            </span>
            {since && (
              <span className="rounded-full bg-sand px-3 py-1 text-[14px] font-extrabold">
                {since}
              </span>
            )}
          </div>
        </div>
      )}

      {FEATURES.pro && (
        <Link to="/pro" className="flex items-center gap-4 rounded-[22px] bg-gold px-4 py-4">
          <ShoppingBasket aria-hidden="true" className="size-7" />
          <span className="flex-1">
            <span className="block text-[20px] font-extrabold leading-6">Probá Moni Pro</span>
            <span className="block text-[15px]">Voz, tickets, bancos y más</span>
          </span>
          <ChevronLeft aria-hidden="true" className="size-6 rotate-180" />
        </Link>
      )}

      <SectionLabel className="mt-1">Mis datos</SectionLabel>
      <ProfileGroup>
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={UsersRound} bg="#e3f2cf" className="size-11" />}
          title="Datos personales"
          subtitle="Nombre, mail y foto"
          onClick={() => setSheet('edit')}
        />
        {FEATURES.monthlyIncome && (
          <OptionRow
            className="rounded-none border-0"
            icon={
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold/40">
                <MoniGlyph className="size-5" />
              </span>
            }
            title="Mis ingresos"
            subtitle={`${formatArs(extras.monthlyIncomeCents)} por mes · solo los ves vos`}
            onClick={() => setSheet('income')}
          />
        )}
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={CreditCard} bg="#e3f2cf" className="size-11" />}
          title={FEATURES.accountAlias ? 'Medios de pago y alias' : 'Medios de pago'}
          subtitle={`${accountCount} ${accountCount === 1 ? 'medio' : 'medios'}`}
          to="/cuentas"
        />
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={Shapes} bg="#e3f2cf" className="size-11" />}
          title="Categorías"
          subtitle="Creá y editá las tuyas"
          to="/categorias"
        />
      </ProfileGroup>

      <SectionLabel className="mt-1">Preferencias</SectionLabel>
      <ProfileGroup>
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={Target} bg="#e3f2cf" className="size-11" />}
          title="Mis objetivos"
          subtitle={
            goalCount === 0
              ? 'Sin elegir · ves todas las herramientas'
              : `${goalCount} ${goalCount === 1 ? 'elegido' : 'elegidos'} · arman tu app`
          }
          onClick={() => setSheet('goals')}
        />
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={Banknote} bg="#d9ebe4" className="size-11" />}
          title="Moneda"
          subtitle={usesUsd ? 'Peso argentino (ARS) · también dólares' : 'Peso argentino (ARS)'}
          chevron={false}
        />
        {FEATURES.weeklyDigest && (
          <OptionRow
            className="rounded-none border-0"
            icon={<IconTile icon={Bell} bg="#d9ebe4" className="size-11" />}
            title="Resumen semanal"
            subtitle={`Los ${weekly.day.toLowerCase()}s, con tus gastos hormiga`}
            chevron={false}
            trailing={
              <Toggle
                label="Resumen semanal"
                checked={weekly.enabled}
                onChange={(enabled) => updateWeeklyDigest({ enabled })}
              />
            }
          />
        )}
      </ProfileGroup>

      <SectionLabel className="mt-1">Cuenta</SectionLabel>
      <ProfileGroup>
        <OptionRow
          className="rounded-none border-0"
          icon={<IconTile icon={LogOut} bg="#f3e8d2" className="size-11" />}
          title="Cerrar sesión"
          onClick={() => setSheet('signout')}
        />
        <OptionRow
          className="rounded-none border-0 [&_span]:text-expense"
          icon={<IconTile icon={Trash2} bg="#fbdcd7" color="#b8321f" className="size-11" />}
          title="Eliminar cuenta"
          onClick={() => setSheet('delete')}
        />
      </ProfileGroup>

      <AppVersion />

      {sheet === 'edit' && (
        <EditProfileSheet
          name={saved}
          email={user?.email ?? ''}
          photo={photo}
          initial={initial}
          onClose={() => setSheet(null)}
        />
      )}
      {FEATURES.monthlyIncome && sheet === 'income' && (
        <IncomeSheet value={extras.monthlyIncomeCents} onClose={() => setSheet(null)} />
      )}
      {sheet === 'goals' && (
        <GoalsSheet saved={profile?.goals ?? []} onClose={() => setSheet(null)} />
      )}
      {sheet === 'signout' && (
        <DecisionSheet
          icon={<ChevronLeft className="size-6" />}
          iconTone="neutral"
          title="¿Cerrar sesión?"
          onClose={() => setSheet(null)}
          actions={[
            { label: 'Quedarme', onClick: () => setSheet(null) },
            {
              label: isSigningOut ? 'Cerrando…' : 'Cerrar sesión',
              tone: 'outline',
              onClick: () => void handleSignOut(),
              disabled: isSigningOut,
            },
          ]}
        >
          Tus gastos, metas y grupos quedan guardados. Volvés a entrar con tu cuenta de Google
          cuando quieras.
        </DecisionSheet>
      )}
      {sheet === 'delete' && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title="¿Eliminar tu cuenta?"
          onClose={() => setSheet(null)}
          actions={[
            { label: 'Mejor no', onClick: () => setSheet(null) },
            {
              label: 'Eliminar mi cuenta',
              tone: 'danger',
              onClick: () => {
                toast.show(
                  'Por ahora la cuenta se elimina desde soporte. Te avisamos cuando esté en la app.',
                )
                setSheet(null)
              },
            },
          ]}
        >
          <p>Se borran tus gastos, metas y todo tu historial. No se puede deshacer.</p>
          <MoniSays
            className="mt-3"
            lead={null}
            icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
          >
            Si estás en grupos, lo que cargaste queda para los demás hasta que se salden las
            cuentas.
          </MoniSays>
        </DecisionSheet>
      )}
    </Page>
  )
}

// Goals chosen in onboarding; they decide which sections the app puts up front.
function GoalsSheet({ saved, onClose }: { saved: readonly string[]; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateGoals()
  const [draft, setDraft] = useState(() => goalsForSelector(saved))
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      await update.mutateAsync(goalsToPersist(draft))
      toast.show('Objetivos actualizados')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Mis objetivos" onClose={onClose}>
      <p className="-mt-1 mb-3 text-[15px] leading-5 text-text-muted">
        Según lo que elijas, Moni te muestra primero esas herramientas. Las demás siguen en Más ›
        Más herramientas.
      </p>
      <ul className="flex flex-col gap-2">
        {GOAL_OPTIONS.map((goal) => {
          const checked = draft.includes(goal.id)
          return (
            <li key={goal.id}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => setDraft((d) => toggleGoal(d, goal.id))}
                className={
                  'flex min-h-14 w-full items-center gap-3 rounded-[18px] border-2 bg-white px-4 py-2 text-left text-[16px] font-semibold leading-5 text-forest ' +
                  (checked ? 'border-forest' : 'border-sand')
                }
              >
                <span className="flex-1">{goal.label}</span>
                <CheckDot checked={checked} />
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-expense">
          {error}
        </p>
      )}
      <Button className="mt-4" onClick={() => void save()} disabled={update.isPending}>
        {update.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </BottomSheet>
  )
}

function ProfileGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-sand overflow-hidden rounded-[24px] border border-sand bg-white px-1">
      {children}
    </div>
  )
}

// Perfil 002 — Editar foto y datos. The name is saved in Supabase; the photo stays on this device.
function EditProfileSheet({
  name,
  email,
  photo,
  initial,
  onClose,
}: {
  name: string
  email: string
  photo: string | null
  initial: string
  onClose: () => void
}) {
  const toast = useToast()
  const update = useUpdateProfile()
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function pick(file: File | undefined) {
    if (!file) return
    updateProfileExtras({ localPhotoUrl: URL.createObjectURL(file), photoRemoved: false })
    toast.show('Foto actualizada en este dispositivo')
  }

  async function save() {
    const parsed = displayNameSchema.safeParse(draft)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisá el nombre.')
    setError(null)
    try {
      if (parsed.data !== name) await update.mutateAsync(parsed.data)
      toast.show('Perfil actualizado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Editar perfil" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ProfilePhoto
          url={photo}
          initial={initial}
          size="md"
          onCamera={() => cameraRef.current?.click()}
        />
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-sand bg-white text-[15px] font-extrabold"
          >
            <Camera aria-hidden="true" className="size-4" /> Sacar foto
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-sand bg-white text-[15px] font-extrabold"
          >
            <Images aria-hidden="true" className="size-4" /> Galería
          </button>
          <button
            type="button"
            onClick={() => updateProfileExtras({ localPhotoUrl: null, photoRemoved: true })}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-sand bg-white text-[15px] font-extrabold text-expense"
          >
            <Trash2 aria-hidden="true" className="size-4" /> Quitar
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Nombre"
          maxLength={60}
          className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px]"
        />
        <SectionLabel>Mail</SectionLabel>
        <input
          value={email}
          readOnly
          aria-label="Mail"
          className="h-14 rounded-[18px] border border-sand bg-sand/40 px-4 text-[17px] text-text-muted"
        />
        <p className="text-[15px] leading-5 text-text-muted">
          Tus amigos y tu pareja te ven con este nombre y esta foto en los grupos. El mail es el de
          tu cuenta de Google.
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </BottomSheet>
  )
}

// Perfil 003 — Mis ingresos (simulated, used by Metas and "según ingresos").
function IncomeSheet({ value, onClose }: { value: number; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(formatAmountInput(value))
  const amount = parseAmountInput(text) ?? 0
  return (
    <BottomSheet title="Mis ingresos" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>Cuánto ingresás por mes</SectionLabel>
        <AmountInput
          aria-label="Ingresos por mes"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <MoniSays
          lead={null}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Solo lo ves vos. Moni lo usa para sugerirte metas y para repartir “según ingresos”: en los
          grupos cada uno ve su porcentaje, nunca lo que gana el otro.
        </MoniSays>
        <p className="text-[15px] leading-5 text-text-muted">
          El aguinaldo y los ingresos extra los cargás aparte, cuando llegan.
        </p>
        <Button
          disabled={amount <= 0}
          onClick={() => {
            updateProfileExtras({ monthlyIncomeCents: amount })
            toast.show('Ingresos guardados')
            onClose()
          }}
        >
          Guardar
        </Button>
      </div>
    </BottomSheet>
  )
}
