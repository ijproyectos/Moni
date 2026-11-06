import { useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { getVapidPublicKey, usePushSubscription } from '../api/usePushSubscription'

// Closing the card only hides it until the next app start: there is no "don't show again", because push is always on.
let closedThisSession = false

/**
 * Non-blocking card on Inicio that asks for the notification permission (a browser permission needs a tap) or, on an
 * iPhone outside the installed app, explains how to install it. Already-granted devices subscribe silently elsewhere
 * (usePushSubscription), so this only shows while the permission is still undecided. Renders nothing without a
 * VAPID key.
 */
export function PushEnrollmentPrompt() {
  if (!getVapidPublicKey()) return null
  return <Prompt />
}

function Prompt() {
  const { pathname } = useLocation()
  const { state, needsInstall, enable } = usePushSubscription()
  const toast = useToast()
  const [closed, setClosed] = useState(closedThisSession)

  const undecided = typeof Notification !== 'undefined' && Notification.permission === 'default'
  const askable = (state === 'off' || state === 'working') && undecided
  if (pathname !== '/' || closed || !(askable || needsInstall)) return null

  function close() {
    closedThisSession = true
    setClosed(true)
  }

  async function activate() {
    try {
      await enable()
    } catch {
      toast.show('No pudimos activar los avisos. Probá de nuevo.', { tone: 'error' })
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[var(--float-bottom)] z-40 mx-auto w-full max-w-[430px] px-4">
      <section
        aria-label="Avisos de Moni"
        className="pointer-events-auto flex flex-col gap-3 rounded-[22px] bg-forest p-4 text-cream shadow-lg"
      >
        {needsInstall ? (
          <>
            <p className="font-display text-[19px] font-extrabold leading-6">
              Instalá Moni para recibir avisos
            </p>
            <p className="text-[15px]">
              En iPhone, tocá Compartir y elegí “Agregar a pantalla de inicio”. Después abrí Moni
              desde ahí.
            </p>
            <Button variant="primary" className="h-12 text-base" onClick={close}>
              Entendido
            </Button>
          </>
        ) : (
          <>
            <p className="font-display text-[19px] font-extrabold leading-6">
              Activá los avisos de Moni
            </p>
            <p className="text-[15px]">
              Te recordamos cargar tus gastos y te avisamos de novedades y mantenimiento.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="h-12 flex-1 text-base"
                disabled={state === 'working'}
                onClick={() => void activate()}
              >
                Activar avisos
              </Button>
              <Button variant="ghost" className="text-cream" onClick={close}>
                Ahora no
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
