import { buildInsight } from './insight'
import { donutArcs } from './donut'

describe('buildInsight', () => {
  it('names the top category and its share', () => {
    const text = buildInsight([
      {
        categoryId: 'a',
        name: 'Comida',
        color: '#000',
        icon: 'Utensils',
        amountCents: 2400,
        percent: 24,
      },
      {
        categoryId: 'b',
        name: 'Súper',
        color: '#000',
        icon: 'ShoppingCart',
        amountCents: 3200,
        percent: 32.4,
      },
    ])
    expect(text).toBe('tu mayor gasto del mes es Súper, con el 32% del total.')
  })

  it('falls back to a friendly message without data', () => {
    expect(buildInsight([])).toMatch(/todavía no cargaste gastos/)
  })
})

describe('donutArcs', () => {
  it('returns no arcs for empty data', () => {
    expect(donutArcs([], 100)).toEqual([])
    expect(donutArcs([0, 0], 100)).toEqual([])
  })

  it('splits the circumference proportionally', () => {
    const arcs = donutArcs([1, 3], 100, 0)
    expect(arcs).toEqual([
      { length: 25, offset: 0 },
      { length: 75, offset: 25 },
    ])
  })
})
