import {
  Camera,
  ChevronLeft,
  CreditCard,
  EyeOff,
  HeartPulse,
  Images,
  Palette,
  ShoppingBasket,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { signOut } from '@/features/auth/api/authActions'
import { useAuth } from '@/features/auth/api/authContext'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { useFinancialHealth } from '@/features/health/api/useFinancialHealth'
import { BAND_LABELS } from '@/features/health/domain/healthScore'
import { usePendingDebts } from '@/features/debts/api/useDebts'
import { useFixedExpenses } from '@/features/fixedExpenses/api/useFixedExpenses'
import { pendingBills } from '@/features/fixedExpenses/domain/fixedExpense'
import { useSavings } from '@/features/goals/api/useSavings'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { SettingCard, SettingRow } from '@/shared/ui/SettingRow'
import { useProfile } from '@/features/auth/api/useProfile'
import { useUpdateProfile } from '@/features/auth/api/useUpdateProfile'
import { displayNameSchema, firstName, initialOf } from '@/features/auth/domain/profile'
import {
  updateWeeklyDigest,
  useWeeklyDigestSettings,
} from '@/features/insights/mock/digestSettings'
import { PushNotificationsRow } from '@/features/push/ui/PushNotificationsRow'
import { AchievementsRow } from '@/features/goals/ui/AchievementsRow'
import { useSubscriptionState } from '@/features/plus/api/useBilling'
import { usePlus } from '@/features/plus/api/usePlus'
import { isCancellable } from '@/features/plus/domain/billing'
import { CancelPlusSheet } from '@/features/plus/ui/CancelPlusSheet'
import { formatPlusExpiry } from '@/features/plus/domain/plus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
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
import { shareLink } from '@/shared/lib/share'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { AppVersion } from '@/shared/ui/AppVersion'
import { Button } from '@/shared/ui/Button'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { CheckDot, MoniSays, OptionRow, Page, SectionLabel, Toggle } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { FEATURES } from '@/shared/config/features'
import { useTheme } from '../api/useTheme'
import { THEME_LABELS, THEME_MODES, type ThemeMode } from '../domain/theme'
import { updateProfileExtras, useProfileExtras } from '../mock/profileExtrasStore'
import {
  ProfileAccessGrid,
  ProfileMoreTools,
  type AccessSubtitles,
} from './ProfileShortcuts'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Sheet = 'edit' | 'income' | 'goals' | 'plus' | 'cancelPlus' | 'signout' | 'delete' | null

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
      <PhotoOrInitial
        url={url}
        initial={initial}
        alt="Tu foto de perfil"
        className={box}
        fallbackClassName="bg-forest font-display font-extrabold text-cream ring-4 ring-lime/60 ring-offset-2 ring-offset-canvas"
      />
      <button
        type="button"
        onClick={onCamera}
        aria-label="Cambiar foto"
        className="absolute -bottom-1 -right-1 flex size-11 items-center justify-center rounded-full border-4 border-canvas bg-forest text-cream"
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
  const extras = useProfileExtras()
  const weekly = useWeeklyDigestSettings()
  const toast = useToast()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const queryClient = useQueryClient()
  const plus = usePlus()
  const subscription = useSubscriptionState()
  const hiddenAmounts = useHiddenAmounts()
  const accounts = useAccounts()
  const allowance = useDailyAllowance()
  const health = useFinancialHealth()
  const fixed = useFixedExpenses()
  const savings = useSavings()
  const { debts } = usePendingDebts()
  const accessSubtitles = useMemo<AccessSubtitles>(() => {
    const out: AccessSubtitles = {}
    if (allowance.allowance.kind === 'ok')
      out.Presupuesto = `${formatArs(Math.max(0, allowance.allowance.spendBudgetCents))} por mes`
    if (fixed.data) {
      const count = fixed.data.expenses.filter((e) => e.status !== 'removed').length
      if (count > 0)
        out['Gastos fijos'] = `${count} · faltan ${pendingBills(fixed.data).length} este mes`
    }
    const activeGoals = savings.data?.goals.filter((g) => g.status === 'active').length ?? 0
    if (activeGoals > 0)
      out['Metas de ahorro'] = `${activeGoals} ${activeGoals === 1 ? 'meta activa' : 'metas activas'}`
    const owed = debts
      .filter((d) => d.direction === 'owed')
      .reduce((sum, d) => sum + d.amountCents, 0)
    if (owed > 0) out.Grupos = `te deben ${formatArs(owed)}`
    return out
  }, [allowance.allowance, fixed.data, savings.data, debts])

  const saved = profile?.display_name ?? ''
  const shortName = firstName(saved) || user?.email?.split('@')[0] || 'Vos'
  const initial = initialOf(saved, user?.email ?? '')
  // A photo picked on this device wins; otherwise the Google account photo, then the stored profile one.
  const photo = extras.photoRemoved
    ? null
    : resolveAvatarUrl({
        uploadedUrl: extras.localPhotoUrl,
        user,
        profileUrl: profile?.avatar_url,
      })
  const createdAt = (profile as { created_at?: string } | undefined)?.created_at
  const since = createdAt
    ? `Desde ${MONTHS[Number(createdAt.slice(5, 7)) - 1]} ${createdAt.slice(0, 4)}`
    : null
  const localPrefs = user ? loadLocalPreferences(user.id) : null
  const usesUsd = (profile?.secondary_currency ?? localPrefs?.secondaryCurrency) === 'USD'
  const goalCount = sanitizeGoals(profile?.goals).length

  function recommend() {
    // Web Share API when the device has it, otherwise the link is copied.
    void shareLink(
      {
        url: window.location.origin,
        text: 'Probá Moni, la app para llevar tus gastos y repartirlos con tus amigos.',
      },
      toast,
    )
  }

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
    <Page className="gap-3 pb-10 pt-6">
      <h1 className="sr-only">Perfil</h1>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : isError ? (
        <p role="alert" className="text-center text-expense">
          No pudimos cargar tu perfil.
        </p>
      ) : (
        <div className="flex items-center gap-3.5 pt-1">
          <button
            type="button"
            onClick={() => setSheet('edit')}
            aria-label="Editar perfil"
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
          >
            <PhotoOrInitial
              url={photo}
              initial={initial}
              alt="Tu foto de perfil"
              className="size-[58px]"
              fallbackClassName="bg-mint-soft font-display text-[20px] font-semibold text-mint-ink"
            />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[21px] font-semibold tracking-[-0.02em]">
              {saved.trim() || shortName}
            </h2>
            {user?.email && <p className="truncate text-[13px] text-text-muted">{user.email}</p>}
          </div>
          {plus.isPlus ? (
            <span className="rounded-full bg-gold px-2.5 py-1 text-[11.5px] font-bold tracking-[0.06em] text-mint-ink">
              ✦ PLUS
            </span>
          ) : (
            <span className="rounded-full bg-sand px-2.5 py-1 text-[11.5px] font-bold tracking-[0.06em] text-text-muted">
              GRATIS
            </span>
          )}
        </div>
      )}

      <Link
        to="/salud"
        className="flex items-center gap-3.5 rounded-[26px] bg-mint px-4 py-3.5 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
      >
        <span
          aria-hidden="true"
          className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-white/[.18] text-[#FFE58A]"
        >
          <HeartPulse className="size-6" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">Salud financiera</span>
          <span className="block text-[12.5px] text-[#DDF3E6]">
            {health.score.kind === 'ok'
              ? `${health.score.score} de 100 · ${BAND_LABELS[health.score.band]}`
              : health.isLoading
                ? 'Mirá cómo viene tu mes'
                : 'Cargá tus ingresos para medirla'}
          </span>
        </span>
        <ChevronLeft aria-hidden="true" className="size-[18px] rotate-180 text-[#DDF3E6]" />
      </Link>

      <ProfileAccessGrid subtitles={accessSubtitles} />

      <SettingCard>
        <SettingRow
          icon={<Palette className="size-[17px]" strokeWidth={1.9} />}
          title="Tema de color"
          trailing={<ThemeSwatches />}
        />
        <SettingRow
          icon={<EyeOff className="size-[17px]" strokeWidth={1.9} />}
          title="Modo privacidad"
          trailing={
            <button
              type="button"
              role="switch"
              aria-checked={hiddenAmounts.hidden}
              aria-label="Modo privacidad"
              onClick={hiddenAmounts.toggle}
              className={cn(
                'relative h-[26px] w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink motion-reduce:transition-none',
                hiddenAmounts.hidden ? 'bg-mint' : 'bg-track',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-[3px] size-5 rounded-full bg-white transition-all motion-reduce:transition-none',
                  hiddenAmounts.hidden ? 'right-[3px]' : 'left-[3px]',
                )}
              />
            </button>
          }
        />
        <SettingRow
          icon={<CreditCard className="size-[17px]" strokeWidth={1.9} />}
          title="Tarjetas y medios de pago"
          to="/cuentas"
          trailing={accounts.data ? accounts.data.length : undefined}
        />
        <PushNotificationsRow />
        <SettingRow
          icon={<Sparkles className="size-[17px]" strokeWidth={1.9} />}
          title={plus.isPlus ? 'Plan Moni Plus' : 'Pasar a Moni Plus'}
          subtitle={
            plus.isPlus && plus.expiresAt
              ? `Activo hasta el ${formatPlusExpiry(plus.expiresAt, true)}`
              : undefined
          }
          trailing={plus.isPlus ? 'Activo' : 'Gratis'}
          onClick={() => setSheet('plus')}
        />
      </SettingCard>

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

      <SectionLabel plain className="mt-3">
        Mis datos
      </SectionLabel>
      <ProfileGroup>
        <OptionRow
          className="rounded-none border-0"
          title="Datos personales"
          subtitle={since ? `Nombre, mail y foto · ${since.toLowerCase()}` : 'Nombre, mail y foto'}
          onClick={() => setSheet('edit')}
        />
        {FEATURES.monthlyIncome && (
          <OptionRow
            className="rounded-none border-0"
            title="Mis ingresos"
            subtitle={`${formatArs(extras.monthlyIncomeCents)} por mes · solo los ves vos`}
            onClick={() => setSheet('income')}
          />
        )}
        <OptionRow
          className="rounded-none border-0"
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
          title="Moneda"
          subtitle={usesUsd ? 'Peso argentino (ARS) · también dólares' : 'Peso argentino (ARS)'}
          chevron={false}
        />
        {FEATURES.weeklyDigest && (
          <OptionRow
            className="rounded-none border-0"
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
        <AchievementsRow />
      </ProfileGroup>

      <SectionLabel plain className="mt-1">
        Moni Plus
      </SectionLabel>
      <ProfileGroup>
        {isCancellable(subscription.data) && (
          <OptionRow
            className="rounded-none border-0"
            title="Cancelar suscripción"
            subtitle={
              plus.expiresAt
                ? `Seguís con Plus hasta el ${formatPlusExpiry(plus.expiresAt, true)}`
                : 'Seguís con Plus hasta que termine lo que pagaste'
            }
            onClick={() => setSheet('cancelPlus')}
          />
        )}
        <OptionRow
          className="rounded-none border-0"
          title="Recomendá a un amigo"
          subtitle="Compartí el link de Moni"
          onClick={recommend}
        />
        <OptionRow
          className="rounded-none border-0"
          title="Contactar a soporte"
          subtitle="Escribinos y mirá tus consultas"
          to="/soporte"
        />
      </ProfileGroup>

      <ProfileMoreTools />

      <SectionLabel plain className="mt-1">
        Cuenta
      </SectionLabel>
      <ProfileGroup>
        <OptionRow
          className="rounded-none border-0"
          title="Cerrar sesión"
          onClick={() => setSheet('signout')}
        />
        <OptionRow
          className="rounded-none border-0 [&_span]:text-expense"
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
      {sheet === 'plus' && <PlusSheet onClose={() => setSheet(null)} />}
      {sheet === 'cancelPlus' && (
        <CancelPlusSheet expiresAt={plus.expiresAt} onClose={() => setSheet(null)} />
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
        Según lo que elijas, Moni te muestra primero esas herramientas. Las demás siguen en Perfil ›
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
                  'flex min-h-14 w-full items-center gap-3 rounded-[18px] border-2 bg-card px-4 py-2 text-left text-[16px] font-semibold leading-5 text-ink ' +
                  (checked ? 'border-ink' : 'border-line')
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

const SWATCH: Record<ThemeMode, string> = {
  light: '#EEF5EF',
  dark: '#0E1A13',
  system: 'linear-gradient(135deg, #EEF5EF 50%, #0E1A13 50%)',
}

/** "Tema de color": Claro / Oscuro / Sistema as three dots, saved on this device only. */
function ThemeSwatches() {
  const { mode, setMode } = useTheme()
  return (
    <span role="radiogroup" aria-label="Tema de color" className="flex gap-0.5">
      {THEME_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={THEME_LABELS[m]}
          title={THEME_LABELS[m]}
          onClick={() => setMode(m)}
          className="flex size-7 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
        >
          <span
            aria-hidden="true"
            className="size-[18px] rounded-full ring-1 ring-line"
            style={{
              background: SWATCH[m],
              boxShadow:
                mode === m
                  ? '0 0 0 2px var(--color-card), 0 0 0 3.5px var(--color-mint-ink)'
                  : undefined,
            }}
          />
        </button>
      ))}
    </span>
  )
}

function ProfileGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card px-1">
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
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-line bg-card text-[15px] font-extrabold"
          >
            <Camera aria-hidden="true" className="size-4" /> Sacar foto
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-line bg-card text-[15px] font-extrabold"
          >
            <Images aria-hidden="true" className="size-4" /> Galería
          </button>
          <button
            type="button"
            onClick={() => updateProfileExtras({ localPhotoUrl: null, photoRemoved: true })}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 border-line bg-card text-[15px] font-extrabold text-expense"
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
          className="h-14 rounded-[18px] border border-line bg-card px-4 text-[17px]"
        />
        <SectionLabel>Mail</SectionLabel>
        <input
          value={email}
          readOnly
          aria-label="Mail"
          className="h-14 rounded-[18px] border border-line bg-sand/40 px-4 text-[17px] text-text-muted"
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
