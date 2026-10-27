import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { useModal } from './useModal'

export interface DecisionAction {
  label: string
  onClick: () => void
  tone?: 'primary' | 'danger' | 'outline'
  disabled?: boolean
}

interface DecisionSheetProps {
  /** Round icon next to the title (trash, back arrow…). */
  icon: ReactNode
  iconTone?: 'danger' | 'neutral'
  title: string
  children?: ReactNode
  /** Before → after rows ("Total del grupo $104.000 > $76.000"). */
  changes?: { label: string; from: string; to: string }[]
  actions: DecisionAction[]
  onClose: () => void
}

const TONES = {
  primary: 'bg-lime text-forest',
  danger: 'bg-expense text-cream',
  outline: 'border-2 border-sand bg-white text-forest',
}

// Confirmation sheets of screens 088 / 092 / 107-118: icon + question, impact and stacked actions.
export function DecisionSheet({
  icon,
  iconTone = 'danger',
  title,
  children,
  changes,
  actions,
  onClose,
}: DecisionSheetProps) {
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-canvas px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 outline-none motion-safe:animate-[sheet-in_220ms_ease-out]"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-sand" />
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-full',
              iconTone === 'danger' ? 'bg-blush/60 text-expense' : 'bg-sand text-expense',
            )}
          >
            {icon}
          </span>
          <h2 id={titleId} className="font-display text-[26px] font-extrabold leading-8">
            {title}
          </h2>
        </div>
        {children && <div className="mt-4 text-[17px] leading-6">{children}</div>}
        {changes && (
          <ul className="mt-4 divide-y divide-sand rounded-[20px] border border-sand bg-white px-4">
            {changes.map((c) => (
              <li key={c.label} className="flex items-center gap-2 py-3 text-[16px]">
                <span className="flex-1 text-text-muted">{c.label}</span>
                <span className="text-text-muted line-through">{c.from}</span>
                <span aria-hidden="true">›</span>
                <strong className="font-extrabold">{c.to}</strong>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              data-autofocus={i === 0 ? true : undefined}
              className={cn(
                'h-14 w-full rounded-full text-[18px] font-extrabold disabled:opacity-60',
                TONES[a.tone ?? 'primary'],
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
