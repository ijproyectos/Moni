import { useSyncExternalStore } from 'react'
import { cn } from '@/shared/ui/cn'
import { CAT_MARKUP, CAT_MARKUP_STILL } from './catMarkup'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches)

/**
 * Moni's cat with parts that move on their own (head tilt, ears, glances, blinking, breathing, tail and an uneven wave), each with
 * its own rhythm so the whole never moves as one stiff piece. Nothing moves with reduced motion (also the drawing's own paw).
 */
export function MoniCatLive({ className }: { className?: string }) {
  const still = useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
  return (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
      data-testid="moni-cat-live"
      data-still={still ? 'true' : undefined}
      className={cn('moni-live', className)}
      dangerouslySetInnerHTML={{ __html: still ? CAT_MARKUP_STILL : CAT_MARKUP }}
    />
  )
}
