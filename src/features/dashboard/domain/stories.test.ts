import { buildStories, type StoryInput } from './stories'

const base: StoryInput = {
  today: '2026-11-04',
  monthName: 'noviembre',
  reminders: [],
  savingsNoticeCount: 0,
  groupNoticeCount: 0,
  noticesPath: '/grupos/avisos',
  debts: [],
  debtsPath: '/grupos',
  spending: {
    expenseCents: 0,
    byCategory: [],
    previousExpenseCents: null,
    previousMonthName: 'octubre',
  },
  goals: { plan: null, reservedCents: 0, targetCents: 0, count: 0 },
  subscriptions: [],
  budgets: [],
  badges: [],
}
const debt = (over = {}) => ({
  key: 'k1',
  groupId: 'g1',
  groupName: 'IJ',
  direction: 'owe' as const,
  otherName: 'Jonatan',
  amountCents: 30_450_00,
  report: null,
  ...over,
})
const ids = (input: Partial<StoryInput>) => buildStories({ ...base, ...input }).map((s) => s.id)

describe('buildStories', () => {
  it('has no stories when there is nothing to tell (nothing is invented)', () => {
    expect(buildStories(base)).toEqual([])
  })

  it('tells debts and what is owed with the real people and amounts', () => {
    const stories = buildStories({
      ...base,
      debts: [
        debt(),
        debt({
          key: 'k2',
          groupId: 'g2',
          groupName: 'Amores',
          direction: 'owed',
          otherName: 'Pablo',
          amountCents: 10_000_00,
        }),
        debt({
          key: 'k3',
          groupId: 'g3',
          groupName: 'Cena',
          direction: 'owed',
          otherName: 'Ana',
          amountCents: 10_000_00,
        }),
      ],
    })
    const cobros = stories.find((s) => s.id === 'cobros')
    expect(cobros?.bubble).toBe('2')
    expect(cobros?.slides[0]?.figure).toBe('$20.000')
    expect(cobros?.slides[0]?.body).toContain('2 personas te deben')
    const deudas = stories.find((s) => s.id === 'deudas')
    expect(deudas?.slides[0]?.figure).toBe('$30.450')
    expect(deudas?.slides[0]?.body).toBe('Le debés a Jonatan en IJ.')
    expect(deudas?.slides[0]?.action?.to).toBe('/grupos/g1')
  })

  it('orders by urgency: notices and due dates, then debts, goals, spending and achievements', () => {
    expect(
      ids({
        reminders: [{ key: 'a', text: 'Mañana se cobra Netflix', to: '/recurrentes' }],
        debts: [debt()],
        spending: {
          ...base.spending,
          expenseCents: 100_00,
          byCategory: [{ name: 'Comida', amountCents: 100_00, percent: 100 }],
        },
        badges: [{ key: 'primer-aporte', name: 'Primer aporte', earnedOn: '2026-11-01' }],
        budgets: [
          { budgetId: 'b', name: 'Comida', state: 'over', percent: 120, remainingCents: -20_00 },
        ],
      }),
    ).toEqual(['recordatorios', 'deudas', 'limites', 'gastos', 'logros'])
  })

  it('only announces a charge that is within the next week', () => {
    const subs = (on: string) => [
      { id: 's', name: 'Netflix', amountCents: 18_000_00, nextChargeOn: on },
    ]
    expect(ids({ subscriptions: subs('2026-11-30') })).toEqual([])
    expect(ids({ subscriptions: subs('2026-11-03') })).toEqual([])
    const [story] = buildStories({ ...base, subscriptions: subs('2026-11-05') })
    expect(story?.bubble).toBe('5')
    expect(story?.slides[0]?.body).toBe('Netflix se cobra mañana.')
    expect(story?.slides[0]?.figure).toBe('$18.000')
  })

  it('compares with the previous month only when it is given (whole months), never an estimate', () => {
    const spending = {
      expenseCents: 150_000_00,
      byCategory: [{ name: 'Súper', amountCents: 90_000_00, percent: 60 }],
      previousExpenseCents: 100_000_00,
      previousMonthName: 'octubre',
    }
    const [story] = buildStories({ ...base, spending })
    expect(story?.slides).toHaveLength(2)
    expect(story?.slides[1]?.figure).toBe('+50%')
    const [without] = buildStories({
      ...base,
      spending: { ...spending, previousExpenseCents: null },
    })
    expect(without?.slides).toHaveLength(1)
  })

  it('goals: says how much is missing this month, or stays quiet when there is nothing to say', () => {
    const plan = {
      status: 'behind',
      missingCents: 80_000_00,
      focus: { goal: { id: 'g9', name: 'Computadora' } },
      goals: [],
    } as never
    const [story] = buildStories({
      ...base,
      goals: { plan, reservedCents: 10_00, targetCents: 100_00, count: 1 },
    })
    expect(story?.slides[0]?.body).toContain('$80.000')
    expect(story?.slides[0]?.body).toContain('Computadora')
    expect(story?.slides[0]?.action).toEqual({ label: 'Ver mi meta', to: '/metas/g9' })
    const quiet = { status: 'pending', missingCents: 0, focus: null, goals: [] } as never
    expect(
      ids({ goals: { plan: quiet, reservedCents: 10_00, targetCents: 100_00, count: 1 } }),
    ).toEqual([])
  })

  it('a story changes signature when its news change, so a seen one comes back as new', () => {
    const a = buildStories({ ...base, debts: [debt()] })[0]
    const b = buildStories({ ...base, debts: [debt({ amountCents: 40_00 })] })[0]
    expect(a?.id).toBe(b?.id)
    expect(a?.signature).not.toBe(b?.signature)
  })

  it('only recent badges tell a story', () => {
    expect(ids({ badges: [{ key: 'x', name: 'X', earnedOn: '2026-09-01' }] })).toEqual([])
  })

  it('does not repeat a debt as a second story per group', () => {
    expect(ids({ debts: [debt()] })).toEqual(['deudas'])
  })

  it('adds the daily average only when the days counted are known, from the real totals', () => {
    const spending = {
      expenseCents: 150_000_00,
      byCategory: [
        { name: 'Súper', amountCents: 90_000_00, percent: 60 },
        { name: 'Salidas', amountCents: 60_000_00, percent: 40 },
      ],
      previousExpenseCents: null,
      previousMonthName: 'octubre',
    }
    const [plain] = buildStories({ ...base, spending })
    expect(plain?.slides.map((s) => s.title)).toEqual(['Tus gastos de noviembre'])
    expect(plain?.slides[0]?.lines).toEqual(['Salidas · 40% · $60.000'])
    const [withDays] = buildStories({ ...base, spending: { ...spending, daysCounted: 10 } })
    expect(withDays?.slides[1]?.figure).toBe('$15.000')
  })

  it('sums only the monthly subscriptions and does not tell a charge twice', () => {
    const subs = [
      { id: 'a', name: 'Netflix', amountCents: 10_000_00, nextChargeOn: '2026-11-05' },
      { id: 'b', name: 'Spotify', amountCents: 5_000_00, nextChargeOn: '2026-12-20' },
      {
        id: 'c',
        name: 'Dominio',
        amountCents: 90_000_00,
        nextChargeOn: '2027-03-01',
        period: 'yearly' as const,
      },
    ]
    const stories = buildStories({ ...base, subscriptions: subs })
    const slide = stories[0]?.slides[1]
    expect(slide?.figure).toBe('$15.000')
    const reminded = buildStories({
      ...base,
      subscriptions: subs,
      reminders: [{ key: 'sub-a', text: 'Mañana Netflix', to: '/recurrentes' }],
    })
    expect(reminded.map((s) => s.id)).toEqual(['recordatorios'])
  })

  it('celebrates limits that are fine with the one used the most', () => {
    const [story] = buildStories({
      ...base,
      budgets: [
        { budgetId: 'a', name: 'Comida', state: 'ok', percent: 62, remainingCents: 38_000_00 },
        { budgetId: 'b', name: 'Ocio', state: 'ok', percent: 20, remainingCents: 80_000_00 },
      ],
    })
    expect(story?.id).toBe('limites')
    expect(story?.slides[0]?.title).toBe('Tus límites van bien')
    expect(story?.slides[0]?.body).toContain('Comida')
  })
})
