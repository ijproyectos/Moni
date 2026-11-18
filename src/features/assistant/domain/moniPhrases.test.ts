import { CAT_VISIBLE, clampToArea, MONI_PHRASES, nextInterval, nextPhrase } from './moniPhrases'

describe('MONI_PHRASES', () => {
  it('has at least 30 different, short phrases', () => {
    expect(MONI_PHRASES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(MONI_PHRASES).size).toBe(MONI_PHRASES.length)
    for (const phrase of MONI_PHRASES) expect(phrase.length).toBeLessThanOrEqual(40)
  })
  it('only suggests conversation: no amounts and no claims about the person\'s money', () => {
    for (const phrase of MONI_PHRASES) expect(phrase).not.toMatch(/\d|\$/)
  })
})

describe('nextPhrase', () => {
  it('never repeats the previous phrase, whatever the random number', () => {
    for (const previous of MONI_PHRASES) {
      for (const r of [0, 0.2, 0.5, 0.99, 1]) {
        expect(nextPhrase(previous, () => r)).not.toBe(previous)
      }
    }
  })
  it('picks any phrase when there is no previous one', () => {
    expect(MONI_PHRASES).toContain(nextPhrase(null, () => 0.5))
  })
})

describe('clampToArea', () => {
  const margin = { edge: 12, top: 60, bottom: 66 }
  const area = { width: 390, height: 800 }
  const size = 132
  it('limits follow the drawn cat: ears (with the float lift), paws and sides', () => {
    const lowest = clampToArea({ x: 999, y: 999 }, area, size, margin, 7)
    // paws (92% of the box) end exactly `margin.bottom` above the bottom; the right side of the drawing 12px from the edge.
    expect(lowest).toEqual({ x: 261, y: 612 })
    expect(lowest.y + CAT_VISIBLE.bottom * size).toBeLessThanOrEqual(800 - 66)
    expect(lowest.x + CAT_VISIBLE.right * size).toBeLessThanOrEqual(390 - 12)
    const highest = clampToArea({ x: -999, y: -999 }, area, size, margin, 7)
    expect(highest).toEqual({ x: -20, y: 64 })
    // ears at the top while floating up 7px are still 60px under the top
    expect(highest.y + CAT_VISIBLE.top * size - 7).toBeGreaterThanOrEqual(60)
    expect(highest.x + CAT_VISIBLE.left * size).toBeGreaterThanOrEqual(12)
  })
  it('keeps a point that is already inside', () => {
    expect(clampToArea({ x: 100, y: 300 }, area, size, margin, 7)).toEqual({ x: 100, y: 300 })
  })
  it('does not break in a tiny area', () => {
    const r = clampToArea({ x: 5, y: 5 }, { width: 50, height: 50 }, size, margin, 7)
    expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true)
  })
})

describe('nextInterval', () => {
  it('is between 12 and 15 seconds and varies', () => {
    expect(nextInterval(() => 0)).toBe(12_000)
    expect(nextInterval(() => 1)).toBe(15_000)
    expect(nextInterval(() => 0.5)).toBe(13_500)
  })
})
