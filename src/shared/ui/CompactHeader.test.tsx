import { act, render } from '@testing-library/react'
import { CompactHeader } from './CompactHeader'
import { useScrolledPast } from './useScrolledPast'

let notify: (entry: Partial<IntersectionObserverEntry>) => void = () => {}

function Probe() {
  const [ref, past] = useScrolledPast<HTMLDivElement>()
  return (
    <>
      <CompactHeader title="Inicio" subtitle="Noviembre" visible={past} />
      <div ref={ref} />
    </>
  )
}

describe('CompactHeader', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: IntersectionObserverEntry[]) => void) {
          notify = (entry) => cb([entry as IntersectionObserverEntry])
        }
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const bar = (c: HTMLElement) => c.querySelector('[data-visible]') as HTMLElement

  it('shows only once the big header has scrolled above the screen, and lets touches through', () => {
    const { container } = render(<Probe />)
    expect(bar(container)).toHaveAttribute('data-visible', 'false')
    act(() => notify({ isIntersecting: false, boundingClientRect: { top: -20 } as DOMRect }))
    expect(bar(container)).toHaveAttribute('data-visible', 'true')
    expect(bar(container)).toHaveClass('pointer-events-none')
    expect(bar(container)).toHaveAttribute('aria-hidden', 'true')
    // Below the viewport (not scrolled past) it stays hidden.
    act(() => notify({ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRect }))
    expect(bar(container)).toHaveAttribute('data-visible', 'false')
  })

  it('never shows without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<Probe />)
    expect(bar(container)).toHaveAttribute('data-visible', 'false')
  })
})
