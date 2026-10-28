import {
  budgetAlerts,
  budgetBadge,
  budgetByCategory,
  parseBudgetLimit,
  parseBudgetStatus,
  parseBudgetSuggestions,
} from './budget'

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  budget_id: 'b1',
  category_id: 'c1',
  name: 'Comida',
  color: '#E5533D',
  icon: 'Utensils',
  amount: 10000,
  spent: 10500.5,
  remaining: -500.5,
  percent: 105,
  state: 'over',
  ...over,
})

describe('parseBudgetStatus', () => {
  it('converts amounts to cents and keeps the state', () => {
    const [b] = parseBudgetStatus([row()])
    expect(b?.amountCents).toBe(1_000_000)
    expect(b?.spentCents).toBe(1_050_050)
    expect(b?.remainingCents).toBe(-50_050)
    expect(b?.state).toBe('over')
  })

  it('accepts an empty list and rejects unknown states', () => {
    expect(parseBudgetStatus([])).toEqual([])
    expect(() => parseBudgetStatus([row({ state: 'bad' })])).toThrow()
  })
})

describe('parseBudgetSuggestions', () => {
  it('converts the suggested amount to cents', () => {
    const [s] = parseBudgetSuggestions([
      {
        category_id: 'c',
        name: 'Súper',
        color: '#064735',
        icon: 'ShoppingCart',
        suggested_amount: 2000,
        months_with_data: 3,
      },
    ])
    expect(s?.suggestedCents).toBe(200_000)
    expect(s?.monthsWithData).toBe(3)
  })
})

describe('budgetAlerts', () => {
  it('keeps warning and over budgets, most pressing first', () => {
    const list = parseBudgetStatus([
      row({ budget_id: '1', name: 'A', percent: 85, state: 'warning' }),
      row({ budget_id: '2', name: 'B', percent: 20, state: 'ok' }),
      row({ budget_id: '3', name: 'C', percent: 130, state: 'over' }),
    ])
    expect(budgetAlerts(list).map((b) => b.name)).toEqual(['C', 'A'])
  })

  it('does not mutate its input', () => {
    const list = parseBudgetStatus([row({ percent: 85, state: 'warning' }), row({ state: 'over' })])
    const copy = [...list]
    budgetAlerts(list)
    expect(list).toEqual(copy)
  })
})

describe('budgetByCategory and budgetBadge', () => {
  it('indexes by category and words the badge', () => {
    const list = parseBudgetStatus([
      row({ percent: 85.6, state: 'warning' }),
      row({ category_id: 'c2', percent: 12, state: 'ok' }),
      row({ category_id: 'c3' }),
    ])
    expect(budgetByCategory(list).get('c2')?.percent).toBe(12)
    expect(list.map(budgetBadge)).toEqual(['Vas por el 85%', '12% del límite', 'Te pasaste'])
  })
})

describe('parseBudgetLimit', () => {
  it('treats empty as no limit and parses es-AR amounts', () => {
    expect(parseBudgetLimit('  ')).toEqual({ ok: true, cents: null })
    expect(parseBudgetLimit('150.000')).toEqual({ ok: true, cents: 15_000_000 })
    expect(parseBudgetLimit('1.500,50')).toEqual({ ok: true, cents: 150_050 })
  })

  it('rejects zero and garbage', () => {
    expect(parseBudgetLimit('0')).toEqual({ ok: false })
    expect(parseBudgetLimit('abc')).toEqual({ ok: false })
  })
})
