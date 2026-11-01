import { Bell } from 'lucide-react'
import { IconTile, OptionRow, Toggle } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { getVapidPublicKey, usePushSubscription } from '../api/usePushSubscription'

/** "Avisos de Moni" row for Perfil. Renders nothing when this build has no VAPID public key. */
export function PushNotificationsRow() {
  if (!getVapidPublicKey()) return null
  return <PushRow />
}

function PushRow() {
  const { state, needsInstall, enable, disable } = usePushSubscription()
  const toast = useToast()

  async function toggle(checked: boolean) {
    try {
      if (checked) await enable()
      else await disable()
    } catch {
      toast.show(
        checked
          ? 'No pudimos activar los avisos. Probá de nuevo.'
          : 'No pudimos desactivar los avisos. Probá de nuevo.',
        { tone: 'error' },
      )
    }
  }

  const toggleable = state === 'off' || state === 'on' || state === 'working'
  let subtitle = 'Mantenimiento, novedades y pedidos de opinión'
  if (needsInstall) {
    subtitle =
      'En iPhone, primero tocá Compartir y elegí “Agregar a pantalla de inicio”. Después abrí Moni desde ahí.'
  } else if (state === 'unsupported') {
    subtitle = 'Este navegador no permite recibir avisos.'
  } else if (state === 'denied') {
    subtitle = 'Los bloqueaste en el navegador. Activalos desde los ajustes del sitio.'
  } else if (state === 'on') {
    subtitle = 'Activados en este dispositivo'
  } else if (state === 'working') {
    subtitle = 'Un segundo…'
  }

  return (
    <OptionRow
      className="rounded-none border-0"
      icon={<IconTile icon={Bell} bg="#d9ebe4" className="size-11" />}
      title="Avisos de Moni"
      subtitle={subtitle}
      chevron={false}
      trailing={
        toggleable ? (
          <Toggle
            label="Avisos de Moni"
            checked={state === 'on' || state === 'working'}
            onChange={(checked) => {
              if (state !== 'working') void toggle(checked)
            }}
          />
        ) : undefined
      }
    />
  )
}
