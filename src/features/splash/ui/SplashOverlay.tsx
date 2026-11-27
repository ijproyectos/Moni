import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import cuerpo from '../assets/gato-cuerpo.svg'
import patita from '../assets/gato-patita.svg'
import { whenAppReady } from '../domain/appReady'
import './splash.css'

const E = {
  out: 'cubic-bezier(.16,1,.3,1)',
  io: 'cubic-bezier(.65,0,.35,1)',
  spring: 'cubic-bezier(.34,1.45,.5,1)',
  soft: 'cubic-bezier(.4,0,.2,1)',
}
/** The design runs 2.9 s: the intro ends at 2.38 s and the circular reveal of the app takes the rest. */
const REVEAL_AT_MS = 2380
const MAX_WAIT_FOR_APP_MS = 2500
const REVEAL_MS = 520
const ORIGIN_Y = '54%'

const STARS: ReadonlyArray<readonly [string, string, string]> = [
  ['s1', '90%', '30%'],
  ['s2', '101%', '52%'],
  ['s3', '82%', '16%'],
  ['s4', '-3%', '34%'],
]
const STAR_COLORS: Record<string, string> = { s1: '#E9C46A', s2: '#B5E07A', s3: '#F4E3A6', s4: '#B5E07A' }

function Star({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 C12.8 7 17 11.2 24 12 C17 12.8 12.8 17 12 24 C11.2 17 7 12.8 0 12 C7 11.2 11.2 7 12 0Z" fill={color} />
    </svg>
  )
}

function restoreRootOf(root: HTMLElement) {
  root.style.clipPath = ''
  root.style.position = ''
  root.style.zIndex = ''
  root.removeAttribute('inert')
}

/**
 * The official Moni splash: letters rise in, the cat waves with the coin, sparkles, then a circle opens onto the REAL app, which keeps
 * loading underneath the whole time (it is `#root`, clipped to nothing until the reveal). Timeline and easings are the approved design.
 */
export function SplashOverlay({ root, onDone }: { root: HTMLElement; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // Before the first paint: the real app stays hidden (and out of the accessibility tree) behind the splash while it loads.
  useLayoutEffect(() => {
    root.style.clipPath = `circle(0px at 50% ${ORIGIN_Y})`
    root.style.position = 'relative'
    root.style.zIndex = '1'
    root.setAttribute('inert', '')
    return () => restoreRootOf(root)
  }, [root])

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const q = (name: string) => host.querySelector<HTMLElement>(`[data-a="${name}"]`)
    const running: Animation[] = []
    let cancelled = false

    const play = (el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!el || typeof el.animate !== 'function') return null
      const a = el.animate(keyframes, { fill: 'both', easing: 'linear', ...options })
      running.push(a)
      return a
    }

    const fit = () => {
      const s = Math.min(1, window.innerWidth / 390, Math.max(0.6, window.innerHeight / 760))
      host.style.setProperty('--moni-splash-scale', String(s))
    }
    fit()
    window.addEventListener('resize', fit)

    const run = async () => {
      // The letters are the brand: wait (briefly) for the font so they never flash in a fallback face.
      try {
        await Promise.race([document.fonts.load("700 116px Fredoka"), new Promise((r) => setTimeout(r, 700))])
      } catch {
        /* no Font Loading API: go on */
      }
      if (cancelled) return

      play(q('bg'), [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: E.soft })
      play(q('grain'), [{ opacity: 0 }, { opacity: 0.07 }], { duration: 320 })
      ;(
        [
          ['lM', 260],
          ['lO', 380],
          ['lN', 500],
          ['lI', 620],
          ['dot', 620],
        ] as const
      ).forEach(([id, delay]) => {
        play(
          q(id),
          [
            { transform: 'translateY(78%) scale(.92)', opacity: 0, filter: 'blur(10px)' },
            { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'blur(0)' },
          ],
          { duration: 520, delay, easing: E.out },
        )
      })
      play(
        q('cat'),
        [
          { opacity: 0, transform: 'translateY(30px) scale(.88)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 560, delay: 1060, easing: E.spring },
      )
      play(
        q('arm'),
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-6deg)', offset: 0.16 },
          { transform: 'rotate(7deg)', offset: 0.4 },
          { transform: 'rotate(-5deg)', offset: 0.62 },
          { transform: 'rotate(6deg)', offset: 0.82 },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 760, delay: 1560, easing: E.io },
      )
      play(
        q('glow'),
        [
          { opacity: 0, transform: 'scale(.7)' },
          { opacity: 1, transform: 'scale(1)', offset: 0.45 },
          { opacity: 0, transform: 'scale(1.12)' },
        ],
        { duration: 1100, delay: 1250, easing: E.soft },
      )
      ;(
        [
          ['s1', 1560],
          ['s2', 1680],
          ['s3', 1800],
          ['s4', 1900],
        ] as const
      ).forEach(([id, delay]) => {
        play(
          q(id),
          [
            { opacity: 0, transform: 'scale(.2) rotate(0deg)' },
            { opacity: 1, transform: 'scale(1) rotate(45deg)', offset: 0.45 },
            { opacity: 0, transform: 'scale(.3) rotate(90deg)' },
          ],
          { duration: 520, delay, easing: E.soft },
        )
      })

      // The intro lasts until the design's reveal point; if the app is not ready by then, the cat keeps waving its last frame a moment.
      await new Promise((r) => setTimeout(r, REVEAL_AT_MS))
      if (cancelled) return
      await whenAppReady(root, MAX_WAIT_FOR_APP_MS)
      if (cancelled) return

      play(
        q('stack'),
        [
          { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
          { opacity: 0, transform: 'scale(1.07)', filter: 'blur(3px)' },
        ],
        { duration: 420, easing: E.soft },
      )
      const radius = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight))
      const reveal = root.animate
        ? root.animate(
            [{ clipPath: `circle(0px at 50% ${ORIGIN_Y})` }, { clipPath: `circle(${radius}px at 50% ${ORIGIN_Y})` }],
            { duration: REVEAL_MS, easing: E.io, fill: 'forwards' },
          )
        : null
      running.push(...(reveal ? [reveal] : []))
      if (reveal) await reveal.finished.catch(() => undefined)
      if (cancelled) return
      reveal?.cancel()
      restoreRootOf(root)
      doneRef.current()
    }

    void run()

    return () => {
      cancelled = true
      window.removeEventListener('resize', fit)
      running.forEach((a) => a.cancel())
    }
  }, [root])

  return createPortal(
    <div ref={ref} className="moni-splash" role="img" aria-label="Moni">
      <div className="moni-splash-layer moni-splash-bg" data-a="bg" />
      <div className="moni-splash-layer moni-splash-grain" data-a="grain" />
      <div className="moni-splash-center">
        <div className="moni-splash-scale">
          <div className="moni-splash-stack" data-a="stack">
            <div className="moni-splash-glow" data-a="glow" />
            <div className="moni-splash-word">
              <span className="moni-splash-lw"><span className="moni-splash-l" data-a="lM">m</span></span>
              <span className="moni-splash-lw"><span className="moni-splash-l" data-a="lO">o</span></span>
              <span className="moni-splash-lw"><span className="moni-splash-l" data-a="lN">n</span></span>
              <span className="moni-splash-lw">
                <span className="moni-splash-l" data-a="lI">&#305;</span>
                <span className="moni-splash-dot" data-a="dot" />
              </span>
            </div>
            <div className="moni-splash-catwrap">
              <div className="moni-splash-cat" data-a="cat">
                <img src={cuerpo} alt="" draggable={false} />
                <img className="moni-splash-arm" src={patita} alt="" draggable={false} data-a="arm" />
                {STARS.map(([id, left, top]) => (
                  <div key={id} className="moni-splash-sp" data-a={id} style={{ left, top }}>
                    <Star color={STAR_COLORS[id] ?? '#E9C46A'} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
