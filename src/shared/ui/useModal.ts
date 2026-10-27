import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Traps Tab inside `ref`, closes on Escape, locks page scroll and restores focus on unmount. */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const first =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0] as HTMLElement
      const lastItem = items[items.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
    // onClose is intentionally read through the latest closure only at event time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
