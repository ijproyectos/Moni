import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from './cn'

export interface AddAction {
  id: string
  label: string
  icon: LucideIcon
  /** Tailwind classes of the colored circle. */
  circle: string
  /** Not available now (e.g. no connection): shown dimmed and not selectable. */
  disabled?: boolean
  onSelect: () => void
}

/**
 * The floating menu over the cat: a single rounded card with the actions side by side (colored circle, icon and name
 * underneath) and a small tip pointing down at the button. It grows out of the cat.
 */
export function AddActionMenu({
  actions,
  note,
  onClose,
  className,
}: {
  actions: readonly AddAction[]
  /** Optional line under the options (e.g. why some are disabled). */
  note?: string
  onClose: () => void
  className?: string
}) {
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    items.current.find((el) => el && !el.disabled)?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
      if (!keys.includes(event.key)) return
      const enabled = items.current.filter((el): el is HTMLButtonElement => !!el && !el.disabled)
      if (enabled.length === 0) return
      event.preventDefault()
      const at = enabled.findIndex((el) => el === document.activeElement)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? (at + 1) % enabled.length
              : (at - 1 + enabled.length) % enabled.length
      enabled[next]?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="menu"
      aria-label="Agregar movimiento"
      className={cn(
        'pointer-events-auto absolute bottom-[calc(100%+32px)] left-1/2 w-[min(20.5rem,calc(100vw-2rem))] -translate-x-1/2 origin-bottom',
        'rounded-[32px] bg-white px-3 pb-3 pt-4 shadow-[0_14px_40px_rgba(6,71,53,0.28)] ring-1 ring-sand',
        'motion-safe:animate-[menu-pop_240ms_cubic-bezier(0.2,0.9,0.3,1.15)]',
        className,
      )}
    >
      <ul className="grid grid-cols-3 gap-1">
        {actions.map((action, index) => (
          <li key={action.id} className="min-w-0">
            <button
              ref={(el) => {
                items.current[index] = el
              }}
              disabled={action.disabled}
              type="button"
              role="menuitem"
              onClick={action.onSelect}
              className="flex min-h-[88px] w-full flex-col items-center gap-2 rounded-[22px] px-1 py-1 transition active:scale-95 disabled:opacity-45 disabled:active:scale-100"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-14 items-center justify-center rounded-full text-white',
                  action.circle,
                )}
              >
                <action.icon className="size-7" strokeWidth={2.25} />
              </span>
              <span className="text-[15px] font-extrabold leading-5 text-forest">
                {action.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-1 px-2 text-center text-[13px] leading-4 text-text-muted">{note}</p>
      )}
      <span
        aria-hidden="true"
        className="absolute -bottom-2 left-1/2 size-5 -translate-x-1/2 rotate-45 rounded-[4px] bg-white ring-1 ring-sand [clip-path:polygon(100%_0,100%_100%,0_100%)]"
      />
    </div>
  )
}
