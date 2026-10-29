import { buildPlanViews } from './plans'

const plan = {
  id: 'p1',
  accountId: 'card',
  description: 'Celular',
  totalCents: 360_000_00,
  count: 12,
  firstNumber: 1,
}
const rows = (from: number, to: number, closing: (n: number) => string) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    planId: 'p1',
    number: from + i,
    amountCents: 30_000_00,
    closingOn: closing(from + i),
  }))
const monthly = (n: number) => `2026-${String(n).padStart(2, '0')}-15`
const dueDays = new Map([['card', 25]])

describe('buildPlanViews', () => {
  it('counts closed statements as paid and the rest as remaining', () => {
    // Installments 1..12 close on the 15th of Jan..Dec 2026; today is 20 Jun: 1-6 are behind.
    const [view] = buildPlanViews({
      plans: [plan],
      installments: rows(1, 12, monthly),
      dueDayByAccount: dueDays,
      today: '2026-06-20',
    })
    expect(view).toMatchObject({
      paid: 6,
      installmentCents: 30_000_00,
      remainingCents: 180_000_00,
      endsOn: '2026-12-25',
    })
  })

  it('adds the installments before "voy en la N" to the paid ones', () => {
    // Loaded on installment 4: rows 4..12 exist, none closed yet → 3 already behind.
    const [view] = buildPlanViews({
      plans: [{ ...plan, firstNumber: 4 }],
      installments: rows(4, 12, (n) =>
        `2026-${String(n + 3).padStart(2, '0')}-15`
          .replace('2026-13', '2027-01')
          .replace('2026-14', '2027-02')
          .replace('2026-15', '2027-03'),
      ),
      dueDayByAccount: dueDays,
      today: '2026-06-01',
    })
    expect(view?.paid).toBe(3)
    expect(view?.remainingCents).toBe(9 * 30_000_00)
  })

  it('a plan with every statement closed has nothing remaining', () => {
    const [view] = buildPlanViews({
      plans: [plan],
      installments: rows(1, 12, monthly),
      dueDayByAccount: dueDays,
      today: '2027-02-01',
    })
    expect(view).toMatchObject({ paid: 12, remainingCents: 0 })
  })

  it('sorts by the month each plan ends and skips plans without installments', () => {
    const second = { ...plan, id: 'p2', description: 'Zapatillas', count: 3 }
    const views = buildPlanViews({
      plans: [plan, second, { ...plan, id: 'p3' }],
      installments: [
        ...rows(1, 12, monthly),
        ...rows(1, 3, monthly).map((r) => ({ ...r, planId: 'p2' })),
      ],
      dueDayByAccount: dueDays,
      today: '2026-01-01',
    })
    expect(views.map((v) => v.description)).toEqual(['Zapatillas', 'Celular'])
  })
})
