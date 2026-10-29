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

/**
 * Asks the browser for permission when available. Resolves to the person's choice: true unless the
 * browser explicitly denied it. Never throws, so it cannot block the flow.
 */
async function requestNotifications(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return true
    if (Notification.permission === 'default') {
      return (await Notification.requestPermission()) !== 'denied'
    }
    return Notification.permission !== 'denied'
  } catch {
    return true
  }
}

// Screen 012 — Notificaciones.
export function OnboardingNotificationsStep({
  onContinue,
  isBusy = false,
}: {
  /** Receives the answer: true = activar, false = más tarde. */
  onContinue: (optIn: boolean) => void
  isBusy?: boolean
}) {
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
          disabled={isBusy}
          onClick={() => void requestNotifications().then((granted) => onContinue(granted))}
        >
          Activar notificaciones
        </Button>
        <Button
          variant="ghost"
          disabled={isBusy}
          onClick={() => onContinue(false)}
          className="text-text-muted-on-dark"
        >
          Más tarde
        </Button>
      </div>
    </>
  )
}
