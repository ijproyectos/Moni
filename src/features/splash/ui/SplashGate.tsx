import { useState, type ReactNode } from 'react'
import { shouldPlaySplash } from '../domain/coldStart'
import { SplashOverlay } from './SplashOverlay'

/**
 * Plays the splash on a cold start only. The children (the real app) render right away underneath, so it loads in the background and is
 * revealed by the splash's closing transition. On any other open it renders just the children.
 */
export function SplashGate({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(shouldPlaySplash)
  const root = typeof document === 'undefined' ? null : document.getElementById('root')
  return (
    <>
      {children}
      {playing && root && <SplashOverlay root={root} onDone={() => {
            document.documentElement.classList.remove('splash-boot')
            setPlaying(false)
          }} />}
    </>
  )
}
