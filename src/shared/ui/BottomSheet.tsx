import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from './useModal'

interface BottomSheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Modal sheet anchored to the bottom: focus trap, Escape/scrim/X to close, labelled by its title. */
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useModal(panelRef, onClose)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim motion-safe:animate-[fade-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-canvas px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 outline-none motion-safe:animate-[sheet-in_220ms_ease-out]"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-sand" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-2xl font-bold text-forest">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-forest"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
