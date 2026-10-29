import { antKey, buildAntsTip, groupDeltas, monthChangePercent, parseAntExpenses } from './ants'

const payload = {
  month: '2026-10-01',
  threshold: 10000,
  month_total: 12000.5,
  share_of_expenses: 2.9,
  groups: [
    {
      category_id: 'c1',
      category_name: 'Comida',
      color: '#E5533D',
      icon: 'Utensils',
      label: 'Cafe',
      count: 3,
      total: 9000,
      average: 3000,
      yearly_projection: 108000,
    },
    {
      category_id: 'c2',
      category_name: 'Super',
      color: '#064735',
      icon: 'ShoppingCart',
      label: 'Super',
      count: 4,
      total: 3000.5,
      average: 750.13,
      yearly_projection: 36006,
    },
  ],
}

describe('parseAntExpenses', () => {
  it('converts amounts to cents', () => {
    const ants = parseAntExpenses(payload)
    expect(ants.thresholdCents).toBe(1_000_000)
    expect(ants.monthTotalCents).toBe(1_200_050)
    expect(ants.groups[1]?.averageCents).toBe(75_013)
    expect(ants.groups[0]?.yearlyProjectionCents).toBe(10_800_000)
    expect(ants.shareOfExpenses).toBe(2.9)
  })

  it('accepts an empty month', () => {
    const ants = parseAntExpenses({
      ...payload,
      month_total: 0,
      share_of_expenses: null,
      groups: [],
    })
    expect(ants.groups).toEqual([])
    expect(ants.shareOfExpenses).toBeNull()
  })

  it('rejects malformed payloads', () => {
    expect(() => parseAntExpenses({ month: '2026-10-01' })).toThrow()
  })
})

describe('groupDeltas', () => {
  it('compares by category and label, ignoring case', () => {
    const now = parseAntExpenses(payload).groups
    const before = parseAntExpenses({
      ...payload,
      groups: [{ ...payload.groups[0], label: 'cafe', total: 6000 }],
    }).groups
    const deltas = groupDeltas(now, before)
    expect(now.map((g) => deltas.get(antKey(g)))).toEqual([300_000, null])
  })
})

describe('monthChangePercent', () => {
  it('is null without a previous month or a base', () => {
    const current = parseAntExpenses(payload)
    expect(monthChangePercent(current, undefined)).toBeNull()
    expect(monthChangePercent(current, parseAntExpenses({ ...payload, month_total: 0 }))).toBeNull()
    expect(
      monthChangePercent(current, parseAntExpenses({ ...payload, month_total: 6000.25 })),
    ).toBe(100)
  })
})

describe('buildAntsTip', () => {
  it('talks about the biggest ant', () => {
    const tip = buildAntsTip(parseAntExpenses(payload).groups)
    expect(tip).toMatch(/^cafe es tu hormiga más grande: 3 veces/)
    expect(tip).toMatch(/\$4\.500 al mes/)
    expect(tip).toMatch(/\$54\.000 al año/)
  })

  it('has a calm message without ants', () => {
    expect(buildAntsTip([])).toMatch(/no veo gastos chicos/)
  })
})
