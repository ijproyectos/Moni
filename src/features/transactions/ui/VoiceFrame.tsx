import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useMovementSheet } from './movementSheetContext'

/**
 * Screen frame of the assistant's voice and review screens (screen 10): a full-height modal with a white close circle
 * on the left and "Cargar a mano" on the right, which leaves for the manual form.
 */
export function VoiceFrame({
  title,
  onClose,
  children,
}: {
  /** Name of the dialog (kept for screen readers; the screen itself has no visible title). */
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { openNew } = useMovementSheet()
  return (
    <BottomSheet title={title} variant="screen" bare onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className={cn(
            'flex size-11 items-center justify-center rounded-full bg-card text-ink',
            FOCUS_RING,
          )}
        >
          <X aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => {
            onClose()
            openNew()
          }}
          className={cn(
            'min-h-11 rounded-full px-2 text-[14px] text-[#4F6157] dark:text-text-muted',
            FOCUS_RING,
          )}
        >
          Cargar a mano
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
    </BottomSheet>
  )
}
