import { Button } from '@/shared/ui/Button'
import { Bell } from 'lucide-react'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useToast } from '@/shared/ui/toastContext'
import { getVapidPublicKey, usePushSubscription } from '../api/usePushSubscription'

/**
 * "Avisos de Moni" row for Perfil. Informational: web push is always on, so there is no switch to turn it off.
 * Without the permission it offers the button that asks for it. Renders nothing when this build has no VAPID key.
 */
export function PushNotificationsRow() {
  if (!getVapidPublicKey()) return null
  return <PushRow />
}

function PushRow() {
  const { state, needsInstall, enable } = usePushSubscription()
  const toast = useToast()

  async function activate() {
    try {
      await enable()
    } catch {
      toast.show('No pudimos activar los avisos. Probá de nuevo.', { tone: 'error' })
    }
  }

  let subtitle = 'Activalos para recibir recordatorios, novedades y avisos del equipo'
  if (needsInstall) {
    subtitle =
      'En iPhone, primero tocá Compartir y elegí “Agregar a pantalla de inicio”. Después abrí Moni desde ahí.'
  } else if (state === 'unsupported') {
    subtitle = 'Este navegador no permite recibir avisos.'
  } else if (state === 'denied') {
    subtitle =
      'Los bloqueaste en este dispositivo. Activalos desde los ajustes del sitio (candado junto a la dirección) o desde Notificaciones del teléfono.'
  } else if (state === 'on') {
    subtitle = 'Siempre activos en este dispositivo'
  } else if (state === 'working') {
    subtitle = 'Un segundo…'
  }

  return (
    <SettingRow
      icon={<Bell className="size-[17px]" strokeWidth={1.9} />}
      title="Notificaciones"
      subtitle={subtitle}
      trailing={
        state === 'on' ? (
          <span className="rounded-full bg-tint-green px-3 py-1 text-[13px] font-extrabold text-ink">
            Activados
          </span>
        ) : state === 'off' || state === 'working' ? (
          <Button
            variant="dark"
            className="h-10 w-auto px-4 text-[15px]"
            disabled={state === 'working'}
            onClick={() => void activate()}
          >
            Activar
          </Button>
        ) : undefined
      }
    />
  )
}
