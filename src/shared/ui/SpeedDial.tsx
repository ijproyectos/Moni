import { X, type LucideIcon } from 'lucide-react'
import { useId, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { useModal } from './useModal'

export interface SpeedDialItem {
  id: string
  label: string
  icon: LucideIcon
  /** Background of the round button (a Tailwind `bg-*` class). */
  toneClassName: string
  disabled?: boolean
  onSelect: () => void
}

interface SpeedDialProps {
  /** Accessible name of the menu. */
  label: string
  /** Items from top to bottom; the first one is the farthest from the "+" button. */
  items: readonly SpeedDialItem[]
  /** Optional line under the stack (e.g. why some items are disabled). */
  note?: string
  onClose: () => void
}

/**
 * Speed-dial menu that opens from the "+" button: blurred backdrop, a vertical stack of labelled round buttons
 * and an X in the place of the "+". Escape, the X and a tap on the backdrop close it; focus is trapped inside
 * and given back to the opener. Items fade in one after another unless the user prefers reduced motion.
 */
export function SpeedDial({ label, items, note, onClose }: SpeedDialProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const noteId = useId()
  useModal(panelRef, onClose)

  function onMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ]
    if (buttons.length === 0) return
    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next = current
    if (event.key === 'ArrowDown') next = current + 1 >= buttons.length ? 0 : current + 1
    else if (event.key === 'ArrowUp') next = current <= 0 ? buttons.length - 1 : current - 1
    else if (event.key === 'Home') next = 0
    else next = buttons.length - 1
    buttons[next]?.focus()
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        data-testid="speed-dial-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-forest/40 backdrop-blur-md motion-safe:animate-[fade-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] flex-col items-end gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)] outline-none"
      >
        <ul
          role="menu"
          aria-label={label}
          aria-describedby={note ? noteId : undefined}
          onKeyDown={onMenuKeyDown}
          className="pointer-events-auto flex flex-col items-end gap-4"
        >
          {items.map((item, index) => {
            const Icon = item.icon
            return (
              <li
                key={item.id}
                role="none"
                style={{ animationDelay: `${(items.length - 1 - index) * 40}ms` }}
                className="motion-safe:animate-[dial-in_200ms_ease-out_both]"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    onClose()
                    item.onSelect()
                  }}
                  className="group flex items-center gap-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-display text-[20px] font-extrabold text-white drop-shadow">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      'flex size-14 items-center justify-center rounded-full text-forest shadow-lg transition group-hover:brightness-95 group-active:scale-95',
                      item.toneClassName,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-6" strokeWidth={2.25} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {note && (
          <p
            id={noteId}
            role="status"
            className="pointer-events-auto self-center rounded-full bg-canvas px-4 py-2 text-center text-sm font-semibold text-text-muted"
          >
            {note}
          </p>
        )}
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onClose}
          className="pointer-events-auto flex size-16 shrink-0 items-center justify-center rounded-full bg-lime text-forest shadow-lg transition hover:brightness-95"
        >
          <X aria-hidden="true" className="size-8" strokeWidth={2.25} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
