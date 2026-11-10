import { Keyboard, Mic } from 'lucide-react'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { cn } from '@/shared/ui/cn'

interface HomeCaptureProps {
  /** Opens the voice flow; without it the microphone is not offered. */
  onVoice?: () => void
  /** Opens the manual "Nuevo movimiento" sheet. */
  onManual: () => void
  /** Voice needs a connection: offline the microphone is disabled and says why. */
  offline?: boolean
  /** Free plan: voice is a Plus feature (the sheet shows the upsell). */
  voicePlusBadge?: boolean
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

/** The two fastest ways to load a movement: the lilac microphone (voice) and the keyboard (manual). */
export function HomeCapture({
  onVoice,
  onManual,
  offline = false,
  voicePlusBadge = false,
}: HomeCaptureProps) {
  return (
    <section aria-label="Cargar un movimiento" className="mx-[18px]">
      <div className="flex gap-2.5">
        {onVoice && (
          <button
            type="button"
            onClick={onVoice}
            disabled={offline}
            aria-label={voicePlusBadge ? 'Cargar con la voz, Plus' : 'Cargar con la voz'}
            className={cn(
              'flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full bg-lilac px-5 text-[16px] font-bold text-lilac-ink disabled:opacity-60',
              RING,
            )}
          >
            <Mic aria-hidden="true" className="size-5" strokeWidth={2.2} />
            <span className="truncate">Contale a Moni</span>
            {voicePlusBadge && (
              <span
                aria-hidden="true"
                className="rounded-full bg-lilac-ink px-2 py-0.5 text-[11px] font-bold text-lilac"
              >
                Plus
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onManual}
          aria-label="Cargar a mano"
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-full bg-card text-ink',
            onVoice ? 'w-14 shrink-0' : 'flex-1 px-5 text-[16px] font-bold',
            RING,
          )}
        >
          <Keyboard aria-hidden="true" className="size-5" strokeWidth={2.2} />
          {!onVoice && <span>Cargar a mano</span>}
        </button>
      </div>
      {offline && onVoice && (
        <p role="status" className="mt-2 text-center text-[12.5px] text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
    </section>
  )
}
