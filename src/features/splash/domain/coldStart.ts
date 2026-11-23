/**
 * Cold start of Moni: a new instance of the app (the person closed it completely and opened it again), as opposed to coming back to an
 * instance that was only in the background.
 *
 * A web page cannot ask "was I killed?" directly, so the best approximation for an installed PWA is:
 *   - a fresh JS context starts with an empty `sessionStorage` (iOS and Android drop it when the standalone app is closed), while
 *     minimizing, locking the phone, switching tabs, changing screens or refetching never reload the page, so the splash is not shown;
 *   - the flag lives in `sessionStorage` on purpose, never in `localStorage`: a permanent mark would hide the splash forever.
 *   - a manual reload or a back/forward restore is not a launch either.
 *
 * Native app (future): the OS launch screen is the splash and this module is replaced by a `LaunchEnv` fed by the native "app launched"
 * event (for example Capacitor's App plugin); `SplashGate` and `SplashOverlay` do not change.
 */

export const SPLASH_SESSION_KEY = 'moni:splash:session'

/** Everything the decision needs, so it can be tested without a browser. */
export interface LaunchEnv {
  /** PerformanceNavigationTiming.type of the page load, when the browser exposes it. */
  navigationType?: string
  pathname: string
  reducedMotion: boolean
  /** True when this JS context already played (or decided about) the splash. */
  alreadyPlayed: boolean
}

/** Paths that must never be covered: the OAuth round trip finishes there and the person should land right away. */
const NO_SPLASH_PATHS = ['/auth/']

export function isColdStart(env: LaunchEnv): boolean {
  if (env.alreadyPlayed) return false
  if (env.reducedMotion) return false
  if (env.navigationType === 'reload' || env.navigationType === 'back_forward') return false
  if (NO_SPLASH_PATHS.some((p) => env.pathname.startsWith(p))) return false
  return true
}

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeSessionFlag(): void {
  try {
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
  } catch {
    /* Storage blocked: the module-level cache below still keeps it to one splash per page load. */
  }
}

function readNavigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return entry?.type
  } catch {
    return undefined
  }
}

let decision: boolean | null = null

/**
 * Decides once per page load (re-renders, StrictMode and remounts get the same answer) and records that this context has launched.
 */
export function shouldPlaySplash(): boolean {
  if (decision !== null) return decision
  if (typeof window === 'undefined') return (decision = false)
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  decision = isColdStart({
    navigationType: readNavigationType(),
    pathname: window.location.pathname,
    reducedMotion,
    alreadyPlayed: readSessionFlag(),
  })
  writeSessionFlag()
  // The inline script of index.html painted the green background for a probable cold start; drop it if the splash is not played.
  if (!decision) document.documentElement.classList.remove('splash-boot')
  return decision
}

/** Test helper: forgets the decision of this page load. */
export function resetSplashDecision(): void {
  decision = null
}
