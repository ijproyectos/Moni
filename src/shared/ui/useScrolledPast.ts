import { useEffect, useRef, useState } from 'react'

/**
 * True once the sentinel element has scrolled out of view above the viewport. Without IntersectionObserver (old
 * browsers, tests) it stays false and the compact header never shows.
 */
export function useScrolledPast<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [past, setPast] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, past] as const
}
