import { ChevronLeft } from 'lucide-react'

interface ProgressHeaderProps {
  step: number
  total: number
  /** Omit on the first step: there is nothing to go back to. */
  onBack?: () => void
}

export function ProgressHeader({ step, total, onBack }: ProgressHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-cream"
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
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-lime transition-[width]"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  )
}
