import { Check } from 'lucide-react'
import mascotUrl from '@/assets/mascot/personaje_notificaciones.svg'
import { Button } from '@/shared/ui/Button'

const REASONS = [
  'Acordarte de anotar tus gastos del día',
  'Avisarte cuando un gasto se carga solo',
  'Contarte cada semana dónde se van tus gastos hormiga',
  'Frenarte antes de pasarte del presupuesto',
  'Contarte cuando alguien divide un gasto con vos',
]

/** Asks the browser for notification permission when available; never blocks the flow. */
async function requestNotifications() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch {
    // Unsupported or blocked: the person can enable them later.
  }
}

// Screen 012 — Notificaciones.
export function OnboardingNotificationsStep({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className="relative mx-auto mt-6 size-[200px]">
        <div aria-hidden="true" className="absolute inset-0 rounded-full bg-surface" />
        <img src={mascotUrl} alt="" className="relative size-full p-3" />
      </div>
      <p className="mt-4 text-center text-[17px] font-extrabold text-lime">¡Vas bárbaro!</p>
      <h1 className="mt-1 text-center font-display text-[32px] font-extrabold leading-[38px] text-cream">
        Que no se te escape nada
      </h1>
      <p className="mt-3 text-center text-[16px] text-text-muted-on-dark">
        Activá las notificaciones para:
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {REASONS.map((reason) => (
          <li key={reason} className="flex gap-3 text-[17px] leading-[22px] text-cream">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-lime"
              strokeWidth={3}
            />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        <Button
          onClick={() => {
            void requestNotifications()
            onContinue()
          }}
        >
          Activar notificaciones
        </Button>
        <Button variant="ghost" onClick={onContinue} className="text-text-muted-on-dark">
          Más tarde
        </Button>
      </div>
    </>
  )
}
