import { ChevronLeft, Moon, Sparkles, Sun, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { clearAssistantMemory } from '@/features/assistant/api/useAssistantChat'
import { signOut } from '@/features/auth/api/authActions'
import { useWeeklyDigestSettings, updateWeeklyDigest } from '@/features/insights/mock/digestSettings'
import { PushNotificationsRow } from '@/features/push/ui/PushNotificationsRow'
import { useSubscriptionState } from '@/features/plus/api/useBilling'
import { usePlus } from '@/features/plus/api/usePlus'
import { isCancellable } from '@/features/plus/domain/billing'
import { formatPlusExpiry } from '@/features/plus/domain/plus'
import { CancelPlusSheet } from '@/features/plus/ui/CancelPlusSheet'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { FEATURES } from '@/shared/config/features'
import { toUserMessage } from '@/shared/lib/errors'
import { shareLink } from '@/shared/lib/share'
import { AppVersion } from '@/shared/ui/AppVersion'
import { cn } from '@/shared/ui/cn'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { MoniSays, Page, Toggle } from '@/shared/ui/kit'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useToast } from '@/shared/ui/toastContext'
import { Link } from 'react-router'
import { ShoppingBasket } from 'lucide-react'
import { useTheme } from '../api/useTheme'
import { GroupLabel, ProfileGroup } from './ProfilePage'
import { GroupNoticePrefs } from './GroupNoticePrefs'

const THEME_CHOICES = [
  { mode: 'light', label: 'Claro', Icon: Sun },
  { mode: 'dark', label: 'Oscuro', Icon: Moon },
] as const

/** "Tema": sun / moon, saved on this device only. Until one is picked the device's own theme shows as selected. */
function ThemeSelector() {
  const { resolved, setMode } = useTheme()
  return (
    <span role="radiogroup" aria-label="Tema de color" className="flex gap-0.5 rounded-full bg-sand p-0.5">
      {THEME_CHOICES.map(({ mode: m, label, Icon }) => {
        const selected = resolved === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setMode(m)}
            className={cn(
              'flex size-9 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
              selected ? 'bg-forest text-cream shadow-sm dark:bg-gold dark:text-on-bright' : 'text-text-muted',
            )}
          >
            <Icon aria-hidden="true" className="size-[18px]" strokeWidth={selected ? 2.1 : 1.75} />
          </button>
        )
      })}
    </span>
  )
}

type Sheet = 'plus' | 'cancelPlus' | 'signout' | 'delete' | null

/** Configuración: appearance, account (payment methods, plan, notifications), help and sign out. */
export function SettingsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const plus = usePlus()
  const subscription = useSubscriptionState()
  const hiddenAmounts = useHiddenAmounts()
  const accounts = useAccounts()
  const weekly = useWeeklyDigestSettings()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      clearAssistantMemory()
      await signOut(queryClient)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setIsSigningOut(false)
    }
  }

  return (
    <Page className="gap-3 pb-6 pt-5">
      <MentaHeader title="Configuración" backTo="/perfil" />

      <GroupLabel>Apariencia</GroupLabel>
      <ProfileGroup>
        <SettingRow title="Tema" trailing={<ThemeSelector />} />
        <SettingRow
          title="Modo privacidad"
          subtitle="Oculta tus saldos al abrir la app"
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
      </ProfileGroup>

      <GroupLabel>Cuenta</GroupLabel>
      <ProfileGroup>
        <SettingRow
          title="Tarjetas y medios de pago"
          to="/cuentas"
          trailing={accounts.data ? accounts.data.length : undefined}
        />
        <SettingRow
          title={plus.isPlus ? 'Plan Moni Plus' : 'Pasar a Moni Plus'}
          subtitle={plus.isPlus && plus.expiresAt ? `Hasta el ${formatPlusExpiry(plus.expiresAt, true)}` : undefined}
          trailing={
            <span className={plus.isPlus ? 'font-bold text-income' : undefined}>{plus.isPlus ? 'Activo' : 'Gratis'}</span>
          }
          onClick={() => setSheet('plus')}
        />
        {isCancellable(subscription.data) && (
          <SettingRow
            title="Cancelar suscripción"
            subtitle={
              plus.expiresAt
                ? `Seguís con Plus hasta el ${formatPlusExpiry(plus.expiresAt, true)}`
                : 'Seguís con Plus hasta que termine lo que pagaste'
            }
            onClick={() => setSheet('cancelPlus')}
          />
        )}
        <PushNotificationsRow />
        {FEATURES.weeklyDigest && (
          <SettingRow
            title="Resumen semanal"
            subtitle={`Los ${weekly.day.toLowerCase()}s, con tus gastos hormiga`}
            trailing={
              <Toggle label="Resumen semanal" checked={weekly.enabled} onChange={(enabled) => updateWeeklyDigest({ enabled })} />
            }
          />
        )}
      </ProfileGroup>

      <GroupNoticePrefs />

      {FEATURES.pro && (
        <Link to="/pro" className="flex items-center gap-4 rounded-[20px] bg-gold px-4 py-3.5 text-on-bright">
          <ShoppingBasket aria-hidden="true" className="size-6" />
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold leading-6">Probá Moni Pro</span>
            <span className="block text-[14px]">Voz, tickets, bancos y más</span>
          </span>
        </Link>
      )}

      <GroupLabel>Ayuda</GroupLabel>
      <ProfileGroup>
        <SettingRow title="Ayuda y contacto" subtitle="Escribinos y mirá tus consultas" to="/soporte" />
        <SettingRow
          title="Recomendá a un amigo"
          subtitle="Compartí el link de Moni"
          onClick={() =>
            void shareLink(
              {
                url: window.location.origin,
                text: 'Probá Moni, la app para llevar tus gastos y repartirlos con tus amigos.',
              },
              toast,
            )
          }
        />
      </ProfileGroup>

      <button
        type="button"
        onClick={() => setSheet('signout')}
        className="mt-2 min-h-11 self-center rounded-full px-4 text-[15px] font-extrabold text-expense focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
      >
        Cerrar sesión
      </button>
      <button
        type="button"
        onClick={() => setSheet('delete')}
        className="min-h-9 self-center text-[13px] text-text-muted underline"
      >
        Eliminar cuenta
      </button>

      <AppVersion />

      {sheet === 'plus' && <PlusSheet onClose={() => setSheet(null)} />}
      {sheet === 'cancelPlus' && <CancelPlusSheet expiresAt={plus.expiresAt} onClose={() => setSheet(null)} />}
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
          Tus gastos, metas y grupos quedan guardados. Volvés a entrar con tu cuenta de Google cuando quieras.
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
                toast.show('Por ahora la cuenta se elimina desde soporte. Te avisamos cuando esté en la app.')
                setSheet(null)
              },
            },
          ]}
        >
          <p>Se borran tus gastos, metas y todo tu historial. No se puede deshacer.</p>
          <MoniSays className="mt-3" lead={null} icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}>
            Si estás en grupos, lo que cargaste queda para los demás hasta que se salden las cuentas.
          </MoniSays>
        </DecisionSheet>
      )}
    </Page>
  )
}
