import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(tsx?|css)$/.test(name) && !/\.test\.|[ ]2\./.test(name) ? [path] : []
  })
}

describe('one scale for the whole app', () => {
  const files = sources(join(process.cwd(), 'src'))

  it('no CSS zoom, density lever or per-screen "figma-scale" is left', () => {
    const offenders = files.filter((file) =>
      /\bzoom\s*:|--ui-zoom|--ui-unzoom|figma-scale/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('nothing scales a whole page with transform: scale() (only small animated parts do)', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    expect(css).not.toMatch(/(html|body|#root)\s*\{[^}]*scale\(/)
  })

  it('the viewport does not disable pinch-zoom (accessibility) and covers the safe areas', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? ''
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('viewport-fit=cover')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable/)
  })

  it('long unbroken words break and the scroll lock keeps the scrollbar space (no sideways jumps)', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('scrollbar-gutter: stable')
  })

  it('floating notices rest on a variable that follows the fixed bar, never on a hard-coded height', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    expect(css).toMatch(/--float-bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 1rem\)/)
    expect(css).toMatch(/:root:has\(\[data-bottom-action\]\)\s*\{[^}]*--float-bottom/)
    for (const file of files.filter((f) => /UpdatePrompt|PushEnrollmentPrompt/.test(f))) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('bottom-[var(--float-bottom)]')
      expect(source).not.toMatch(/bottom-2[0-9]/)
    }
  })

  it('every fixed bottom bar declares itself with data-bottom-action', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      const bars = source.match(/<div[^>]*fixed inset-x-0 bottom-0[^>]*>/g) ?? []
      return bars.some((tag) => !tag.includes('data-bottom-action'))
    })
    expect(offenders).toEqual([])
  })
})
