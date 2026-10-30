import { Check, Clock, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { useActivationWatch } from '../api/useActivationWatch'
import type { ThanksPhase } from '../domain/billing'

const COPY: Record<ThanksPhase, { title: string; text: string }> = {
  initializing: {
    title: 'Un momento…',
    text: 'Estamos revisando tu suscripción.',
  },
  processing: {
    title: 'Procesando tu pago',
    text: 'Mercado Pago nos avisa cuando se confirma. No cierres esta pantalla, suele tardar unos segundos.',
  },
  success: {
    title: '¡Ya sos Moni Plus!',
    text: 'Tu suscripción está activa. Ya podés usar voz, tickets y todos los grupos que quieras.',
  },
  delayed: {
    title: 'Tu pago todavía se está activando',
    text: 'La activación puede tardar unos minutos. Si pagaste, no hace falta que hagas nada más: Moni Plus aparece solo. Podés volver a revisar cuando quieras.',
  },
  error: {
    title: 'No pudimos confirmar tu suscripción',
    text: 'Puede que el pago no se haya completado o que no tengamos conexión. Revisá de nuevo o probá suscribirte otra vez desde tu perfil.',
  },
}

/** Where Mercado Pago sends the buyer back (back_url). Shows initializing / processing / success / delayed / error. */
export function PlusThanksPage() {
  const { phase, retry } = useActivationWatch()
  const copy = COPY[phase]
  const Icon = phase === 'success' ? Check : phase === 'error' ? TriangleAlert : Clock

  return (
    <main className="flex flex-col items-center gap-4 px-5 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-sand text-ink"
      >
        <Icon className="size-8" />
      </span>
      <h1 className="font-display text-[28px] font-extrabold leading-8 text-ink">{copy.title}</h1>
      <p
        role={phase === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className="text-[17px] leading-6 text-ink"
      >
        {copy.text}
      </p>
      {(phase === 'delayed' || phase === 'error') && (
        <Button variant="dark" onClick={retry}>
          Revisar de nuevo
        </Button>
      )}
      <Link to="/perfil" className="min-h-11 text-[17px] font-bold text-ink underline">
        {phase === 'success' ? 'Ir a mi perfil' : 'Volver a mi perfil'}
      </Link>
    </main>
  )
}
