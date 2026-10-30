import { useLocation, useNavigate } from 'react-router'

/**
 * Back to the screen the person came from, whichever it was (Inicio, Viajes, Grupos…). Only when there is no screen
 * before this one (the page was opened directly, from a link or the home screen icon) does it go to `fallback`,
 * replacing the entry so back never bounces between the two. Going back instead of pushing the parent keeps the
 * history free of repeated screens and loops, and behaves like the browser's own back button.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => {
    // The router numbers the history entries of the browser (`idx`, 0 for the first one); without it (tests, other
    // routers) the first location is the one with the "default" key.
    const idx: unknown = window.history.state?.idx
    const hasPrevious = typeof idx === 'number' ? idx > 0 : key !== 'default'
    if (hasPrevious) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}
