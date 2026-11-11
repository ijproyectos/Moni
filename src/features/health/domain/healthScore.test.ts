import {
  bandOf,
  computeHealthScore,
  healthSeries,
  scoreDelta,
  suggestImprovement,
  type HealthMonthInput,
} from './healthScore'

const base: HealthMonthInput = {
  month: '2026-11-01',
  incomeCents: 1_000_000_00,
  expenseCents: 850_000_00,
  installmentsCents: 100_000_00,
  fixedCents: 350_000_00,
  budgetCompliance: 0.8,
}

describe('computeHealthScore', () => {
  it('is sin-datos without income', () => {
    expect(computeHealthScore({ ...base, incomeCents: null }).kind).toBe('sin-datos')
    expect(computeHealthScore({ ...base, incomeCents: 0 }).kind).toBe('sin-datos')
  })

  it('weights the four factors: 15% saving, 10% installments, 35% fixed, 80% budget is a perfect score', () => {
    const r = computeHealthScore(base)
    expect(r.kind === 'ok' && r.score).toBe(100)
  })

  it('scores a mixed month numerically', () => {
    // saving 9% -> 60, installments 10% -> 100, fixed 37% -> 94, budget 60% -> 75
    // (35*60 + 20*100 + 20*94 + 25*75) / 100 = 78.75 -> 79
    const r = computeHealthScore({
      ...base,
      expenseCents: 910_000_00,
      fixedCents: 370_000_00,
      budgetCompliance: 0.6,
    })
    expect(r.kind === 'ok' && r.score).toBe(79)
  })

  it('leaves factors without data out of the average and shows them as null', () => {
    const r = computeHealthScore({ ...base, installmentsCents: null, budgetCompliance: null })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.factors.find((f) => f.id === 'installments')?.value).toBeNull()
    expect(r.factors.find((f) => f.id === 'budget')?.tone).toBeNull()
    // saving 15% -> 100, fixed 35% -> 100
    expect(r.score).toBe(100)
  })

  it('never goes below 0 or above 100', () => {
    const r = computeHealthScore({
      ...base,
      expenseCents: 2_000_000_00,
      installmentsCents: 900_000_00,
      fixedCents: 900_000_00,
      budgetCompliance: 0,
    })
    expect(r.kind === 'ok' && r.score).toBe(0)
  })

  it('tones each factor with chip copy and bar geometry', () => {
    const r = computeHealthScore({ ...base, expenseCents: 910_000_00, fixedCents: 370_000_00 })
    if (r.kind !== 'ok') throw new Error('expected ok')
    const savings = r.factors.find((f) => f.id === 'savings')
    expect(savings).toMatchObject({ toneLabel: 'Mejorable', tone: 'warn' })
    expect(savings?.fill).toBeCloseTo(0.3)
    const fixed = r.factors.find((f) => f.id === 'fixed')
    expect(fixed).toMatchObject({ toneLabel: 'Ajustado' })
    expect(fixed?.fill).toBeCloseTo(0.529, 2)
  })
})

describe('bandOf', () => {
  it('maps score ranges', () => {
    expect(bandOf(85)).toBe('excelente')
    expect(bandOf(68)).toBe('bien')
    expect(bandOf(45)).toBe('mejorable')
    expect(bandOf(10)).toBe('cuidado')
  })
})

describe('series and delta', () => {
  it('delta needs two scorable consecutive months', () => {
    const series = healthSeries([
      { ...base, month: '2026-10-01', expenseCents: 900_000_00 },
      base,
    ])
    expect(series.map((s) => s.score)).toEqual([expect.any(Number), 100])
    expect(typeof scoreDelta(series)).toBe('number')
    const gap = healthSeries([{ ...base, month: '2026-10-01', incomeCents: null }, base])
    expect(gap[0]?.score).toBeNull()
    expect(scoreDelta(gap)).toBeNull()
  })
})

describe('suggestImprovement', () => {
  it('proposes saving up to 3 points of income and recomputes the score', () => {
    const s = suggestImprovement({ ...base, expenseCents: 910_000_00 })
    if (s?.kind !== 'save') throw new Error('expected save')
    expect(s.amountCents).toBe(30_000_00)
    expect(s.fromRate).toBeCloseTo(0.09)
    expect(s.toRate).toBeCloseTo(0.12)
    expect(s.newScore).toBeGreaterThan(79 - 20)
  })

  it('never suggests going past the goal', () => {
    const s = suggestImprovement({ ...base, expenseCents: 860_000_00 })
    if (s?.kind !== 'save') throw new Error('expected save')
    expect(s.toRate).toBeLessThanOrEqual(0.15 + 1e-9)
  })

  it('points at the weakest factor once saving is on goal', () => {
    const s = suggestImprovement({ ...base, fixedCents: 600_000_00 })
    expect(s).toMatchObject({ kind: 'reduce', factor: 'fixed' })
  })

  it('keeps going when everything is fine, and is null without income', () => {
    expect(suggestImprovement(base)).toEqual({ kind: 'keep' })
    expect(suggestImprovement({ ...base, incomeCents: null })).toBeNull()
  })
})
