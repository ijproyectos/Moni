/** Marker that FullScreenLoader carries: while one is on screen the real interface (session, profile, lazy route) is not ready yet. */
export const APP_LOADING_ATTR = 'data-app-loading'

/**
 * Resolves when the real interface is on screen (something rendered and no full-screen loader left, for two frames in a row), or after
 * `maxWaitMs`, so a slow network never traps the person behind the splash.
 */
export function whenAppReady(root: HTMLElement, maxWaitMs: number): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now()
    let stable = 0
    const check = () => {
      const ready = root.childElementCount > 0 && root.querySelector(`[${APP_LOADING_ATTR}]`) === null
      stable = ready ? stable + 1 : 0
      if (stable >= 2 || performance.now() - started >= maxWaitMs) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}
