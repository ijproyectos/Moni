import { buildHealthInputs, budgetCompliance, type HealthSources } from './healthInputs'

const base: HealthSources = {
  months: ['2026-09-01', '2026-10-01', '2026-11-01'],
  summaries: [
    { incomeCents: 1_000_00, expenseCents: 900_00 },
    { incomeCents: 1_200_00, expenseCents: 1_000_00 },
    { incomeCents: 0, expenseCents: 300_00 },
  ],
  transactions: [
    { kind: 'expense', status: 'posted', amountCents: 100_00, occurredOn: '2026-10-23', installmentPlanId: 'p' },
    { kind: 'expense', status: 'posted', amountCents: 50_00, occurredOn: '2026-10-05', installmentPlanId: null },
    { kind: 'expense', status: 'voided', amountCents: 70_00, occurredOn: '2026-10-23', installmentPlanId: 'p' },
  ],
  fixedPayments: [
    { status: 'posted', amountCents: 200_00, paidOn: '2026-10-10', voidedElsewhere: false },
    { status: 'posted', amountCents: 999_00, paidOn: '2026-10-11', voidedElsewhere: true },
  ],
  subscriptionCharges: [{ status: 'posted', amountCents: 20_00, dueOn: '2026-10-05', voidedElsewhere: false }],
  hasFixedOrSubscriptions: true,
  budgets: [undefined, [{ state: 'ok' }, { state: 'over' }, { state: 'warning' }, { state: 'ok' }] as never, []],
}

describe('buildHealthInputs', () => {
  it('maps each month to its factors', () => {
    const [sep, oct, nov] = buildHealthInputs(base)
    expect(sep).toMatchObject({ incomeCents: 1_000_00, installmentsCents: 0, fixedCents: 0, budgetCompliance: null })
    expect(oct).toMatchObject({
      incomeCents: 1_200_00,
      expenseCents: 1_000_00,
      installmentsCents: 100_00,
      fixedCents: 220_00,
      budgetCompliance: 0.75,
    })
    expect(nov?.budgetCompliance).toBeNull()
  })

  it('uses the expected income for the current month (average of the previous ones)', () => {
    const nov = buildHealthInputs(base)[2]
    expect(nov?.incomeCents).toBe(1_100_00)
  })

  it('leaves out factors the person does not have', () => {
    const [sep] = buildHealthInputs({
      ...base,
      transactions: [],
      hasFixedOrSubscriptions: false,
    })
    expect(sep?.installmentsCents).toBeNull()
    expect(sep?.fixedCents).toBeNull()
  })

  it('skips months that have not loaded and has no income when there is none anywhere', () => {
    const r = buildHealthInputs({
      ...base,
      summaries: [undefined, { incomeCents: 0, expenseCents: 5 }, { incomeCents: 0, expenseCents: 5 }],
    })
    expect(r.map((m) => m.month)).toEqual(['2026-10-01', '2026-11-01'])
    expect(r[0]?.incomeCents).toBeNull()
    expect(r[1]?.incomeCents).toBeNull()
  })
})

describe('budgetCompliance', () => {
  it('is the share of budgets not exceeded', () => {
    expect(budgetCompliance([{ state: 'ok' }, { state: 'over' }])).toBe(0.5)
    expect(budgetCompliance([])).toBeNull()
    expect(budgetCompliance(undefined)).toBeNull()
  })
})
