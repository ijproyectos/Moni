import { ChevronLeft } from 'lucide-react'
import { cn } from './cn'

interface ProgressHeaderProps {
  step: number
  total: number
  /** Omit on the first step: there is nothing to go back to. */
  onBack?: () => void
}

/** Back button and one segment per step (the finished ones are filled), as in the Figma onboarding. */
export function ProgressHeader({ step, total, onBack }: ProgressHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-[0_1px_3px_rgb(16_48_30/0.12)]"
        >
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2} />
        </button>
      ) : (
        <span className="size-11 shrink-0" aria-hidden="true" />
      )}
      <div
        role="progressbar"
        aria-label="Progreso"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        className="flex flex-1 gap-2"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < step ? 'bg-forest dark:bg-lime' : 'bg-forest/15 dark:bg-white/15',
            )}
          />
        ))}
      </div>
    </div>
  )
}
