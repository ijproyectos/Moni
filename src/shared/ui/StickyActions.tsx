import type { ReactNode } from 'react'

/**
 * Keeps the main button of a form inside a scrolling sheet always in view: it sticks to the bottom edge while the
 * fields scroll underneath. The negative margin and the padding give back the sheet's own bottom padding (which
 * includes the device's safe area), so the button sits where it would at the end of the form.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mb-[max(env(safe-area-inset-bottom),20px)] bg-canvas pb-[max(env(safe-area-inset-bottom),20px)] pt-2 short:pt-1">
      {children}
    </div>
  )
}
