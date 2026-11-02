import { formatArs } from '@/shared/lib/money'
import {
  averageSaved,
  goalPlan,
  monthPoint,
  monthsBetween,
  monthVerdict,
  parsePlanData,
  perMonth,
  planNow,
  recommend,
  reservedAtStart,
  scaleMax,
  simulate,
  type MonthlyRow,
  type PlanInput,
} from './savingsPlan'
import { makeGoal } from './testing'

const TODAY = '2026-11-15'
const row = (goalId: string, month: string, dep: number, wd = 0, rel = 0): MonthlyRow => ({
  goalId,
  month,
  depositedCents: dep * 100,
  withdrawnCents: wd * 100,
  releasedCents: rel * 100,
})
const life = (createdAt: string, over: Record<string, string | null> = {}) => ({
  createdAt,
  completedAt: null,
  archivedAt: null,
  pausedAt: null,
  ...over,
})
const goal = (over: Parameters<typeof makeGoal>[0] = {}) =>
  makeGoal({ targetCents: 1_200_000_00, reservedCents: 0, targetDate: '2027-01-31', ...over })

function input(
  goals: ReturnType<typeof goal>[],
  rows: MonthlyRow[],
  lives = {},
  today = TODAY,
): PlanInput {
  return {
    today,
    goals,
    data: {
      months: rows,
      lives: Object.fromEntries(goals.map((g) => [g.id, life('2026-08-10T12:00:00Z')])) && {
        ...Object.fromEntries(goals.map((g) => [g.id, life('2026-08-10T12:00:00Z')])),
        ...lives,
      },
    },
  }
}

describe('months', () => {
  it('counts whole months across years, both ways', () => {
    expect(monthsBetween('2026-11-01', '2027-01-01')).toBe(2)
    expect(monthsBetween('2026-12-01', '2027-01-01')).toBe(1)
    expect(monthsBetween('2027-01-01', '2026-12-01')).toBe(-1)
    expect(monthsBetween('2026-11-01', '2026-11-01')).toBe(0)
  })

  it('perMonth rounds up to the cent and never divides by zero', () => {
    expect(perMonth(1_000_00, 3)).toBe(33_334)
    expect(perMonth(0, 3)).toBe(0)
    expect(perMonth(500_00, 0)).toBe(0)
  })
})

describe('reserve at the start of a month (rebuilt from the movements)', () => {
  const rows = [
    row('g1', '2026-09-01', 100_000, 0),
    row('g1', '2026-10-01', 50_000, 20_000),
    row('g1', '2026-11-01', 30_000),
  ]
  it('adds every month before it, deposits minus withdrawals', () => {
    expect(reservedAtStart('g1', '2026-09-01', rows)).toBe(0)
    expect(reservedAtStart('g1', '2026-10-01', rows)).toBe(100_000_00)
    expect(reservedAtStart('g1', '2026-11-01', rows)).toBe(130_000_00)
    expect(reservedAtStart('g1', '2026-12-01', rows)).toBe(160_000_00)
  })
  it('also subtracts what a completion or an archive released', () => {
    expect(
      reservedAtStart('g1', '2026-12-01', [...rows, row('g1', '2026-11-01', 0, 0, 100_000)]),
    ).toBe(60_000_00)
  })
  it('only looks at that goal', () => {
    expect(reservedAtStart('other', '2026-12-01', rows)).toBe(0)
  })
})

describe('goalPlan: what one goal asks for', () => {
  it('spreads what is missing over the months left, this one included', () => {
    const g = goal({ reservedCents: 0 }) // Nov, Dec, Jan = 3 months for 1.200.000
    const p = goalPlan(g, input([g], []))
    expect(p.state).toBe('planned')
    expect(p.monthsLeft).toBe(3)
    expect(p.needNowCents).toBe(400_000_00)
    expect(p.needNextCents).toBe(400_000_00)
  })

  it('what was saved before the month lowers what is asked, not what was saved this month', () => {
    const g = goal({ reservedCents: 600_000_00 + 100_000_00 })
    // 600.000 reserved before November + 100.000 deposited in November.
    const rows = [row('g1', '2026-10-01', 600_000), row('g1', '2026-11-01', 100_000)]
    const p = goalPlan(g, input([g], rows))
    expect(p.needNowCents).toBe(200_000_00) // (1.200.000 - 600.000) / 3 at the start of the month
    expect(p.needNextCents).toBe(166_666_67) // (1.200.000 - 700.000) / 3: what is missing now, over the months left
  })

  it('the last month asks for everything that is missing, and nothing after', () => {
    const g = goal({ targetDate: '2026-11-30', reservedCents: 1_000_000_00 })
    const rows = [row('g1', '2026-10-01', 1_000_000)]
    const p = goalPlan(g, input([g], rows))
    expect(p.monthsLeft).toBe(1)
    expect(p.needNowCents).toBe(200_000_00)
    expect(p.needNextCents).toBe(0)
  })

  it('a reached goal asks for nothing', () => {
    const g = goal({ reservedCents: 1_200_000_00 })
    expect(goalPlan(g, input([g], [])).state).toBe('done')
    expect(goalPlan(goal({ reservedCents: 2_000_000_00 }), input([g], [])).needNowCents).toBe(0)
  })

  it('an expired goal is explained, not calculated', () => {
    const g = goal({ targetDate: '2026-09-30' })
    const p = goalPlan(g, input([g], []))
    expect(p.state).toBe('overdue')
    expect(p.needNowCents).toBe(0)
  })

  it('a goal without a date has no schedule', () => {
    const g = goal({ targetDate: null })
    expect(goalPlan(g, input([g], [])).state).toBe('no_date')
  })

  it('a paused goal asks for nothing', () => {
    expect(goalPlan(goal({ status: 'paused' }), input([goal()], [])).state).toBe('paused')
  })

  it('little time and a big part missing needs attention; more time does not', () => {
    const soon = goal({ targetDate: '2026-12-31', reservedCents: 300_000_00 })
    expect(goalPlan(soon, input([soon], [row('g1', '2026-10-01', 300_000)])).state).toBe(
      'attention',
    )
    const later = goal({ targetDate: '2027-06-30', reservedCents: 300_000_00 })
    expect(goalPlan(later, input([later], [row('g1', '2026-10-01', 300_000)])).state).toBe(
      'planned',
    )
    const nearlyThere = goal({ targetDate: '2026-12-31', reservedCents: 1_100_000_00 })
    expect(
      goalPlan(nearlyThere, input([nearlyThere], [row('g1', '2026-10-01', 1_100_000)])).state,
    ).toBe('planned')
  })
})

describe('several goals with different dates', () => {
  // A: 1.200.000 for January (3 months left). B: 1.500.000 for May (7 months left).
  const a = goal({
    id: 'A',
    name: 'Computadora',
    targetCents: 1_200_000_00,
    targetDate: '2027-01-31',
  })
  const b = goal({ id: 'B', name: 'Casa', targetCents: 1_500_000_00, targetDate: '2027-05-31' })
  const inp = input([a, b], [])

  it('combines each goal need, not one pot divided by an arbitrary number of months', () => {
    expect(monthPoint(inp, '2026-11-01').requiredCents).toBe(400_000_00 + 214_285_72) // 1.500.000 / 7 rounded up
  })

  it('the early goal asks more while it lasts and stops asking after its month', () => {
    const jan = monthPoint(inp, '2027-01-01').requiredCents
    const feb = monthPoint(inp, '2027-02-01').requiredCents
    expect(jan).toBe(400_000_00 + 214_285_72)
    expect(feb).toBe(214_285_72)
    expect(monthPoint(inp, '2027-05-01').requiredCents).toBe(214_285_72)
    expect(monthPoint(inp, '2027-06-01').requiredCents).toBe(0)
  })

  it('summarises the plan in steps with the amount of each stretch', () => {
    const now = planNow(inp)
    expect(now.requiredCents).toBe(614_285_72)
    expect(now.steps).toEqual([
      { from: '2026-11-01', to: '2027-01-01', perMonthCents: 614_285_72 },
      { from: '2027-02-01', to: '2027-05-01', perMonthCents: 214_285_72 },
    ])
  })
})

describe('monthPoint: saved against required, by month', () => {
  const g = goal({ reservedCents: 330_000_00, targetCents: 1_200_000_00, targetDate: '2027-01-31' })
  const rows = [
    row('g1', '2026-09-01', 100_000),
    row('g1', '2026-10-01', 130_000, 20_000),
    row('g1', '2026-11-01', 120_000),
  ]
  const inp = input([g], rows)

  it('a past month: what was really saved (net of withdrawals) against what was needed then', () => {
    const oct = monthPoint(inp, '2026-10-01')
    expect(oct.kind).toBe('past')
    expect(oct.savedCents).toBe(110_000_00)
    // At the start of October: 100.000 reserved, 1.100.000 missing over Oct, Nov, Dec, Jan = 275.000.
    expect(oct.requiredCents).toBe(275_000_00)
  })

  it('the current month is marked and uses the money saved so far', () => {
    const nov = monthPoint(inp, '2026-11-01')
    expect(nov.kind).toBe('current')
    expect(nov.savedCents).toBe(120_000_00)
  })

  it('a future month has no saved amount (it has not happened) but a planned one', () => {
    const dec = monthPoint(inp, '2026-12-01')
    expect(dec.kind).toBe('future')
    expect(dec.savedCents).toBeNull()
    expect(dec.requiredCents).toBe(290_000_00) // (1.200.000 - 330.000) / 3
  })

  it('months before the goals existed have no goals and no records', () => {
    const p = monthPoint(inp, '2026-05-01')
    expect(p).toMatchObject({ goalsExisted: 0, hasRecords: false, requiredCents: 0 })
    expect(monthVerdict(p)).toEqual({ kind: 'no_goals' })
  })

  it('a contribution dated before the goal was created counts that month as part of the goal, with no plan asked yet', () => {
    const i5 = input([g], [row('g1', '2026-06-01', 50_000)], { g1: life('2026-08-10T12:00:00Z') })
    const jun = monthPoint(i5, '2026-06-01')
    expect(jun.goalsExisted).toBe(1)
    expect(jun.savedCents).toBe(50_000_00)
    expect(jun.requiredCents).toBe(0)
    expect(monthVerdict(jun)).toEqual({ kind: 'no_plan', savedCents: 50_000_00 })
    expect(monthPoint(i5, '2026-05-01').goalsExisted).toBe(0)
  })

  it('a month with goals but no contributions is a real zero, not missing data', () => {
    const empty = input([g], [])
    const p = monthPoint(empty, '2026-10-01')
    expect(p.savedCents).toBe(0)
    expect(p.hasRecords).toBe(false)
    expect(monthVerdict(p)).toMatchObject({ kind: 'short', savedCents: 0 })
  })

  it('goals that stop asking after being completed, archived or paused', () => {
    const done = goal({ status: 'completed', targetDate: '2027-03-31', reservedCents: 0 })
    const lives = { g1: life('2026-08-10T00:00:00Z', { completedAt: '2026-10-05T00:00:00Z' }) }
    const i2 = input([done], [], lives)
    expect(monthPoint(i2, '2026-10-01').requiredCents).toBeGreaterThan(0)
    expect(monthPoint(i2, '2026-11-01').requiredCents).toBe(0)
    const paused = goal({ status: 'paused' })
    const i3 = input([paused], [], {
      g1: life('2026-08-10T00:00:00Z', { pausedAt: '2026-10-20T00:00:00Z' }),
    })
    expect(monthPoint(i3, '2026-09-01').requiredCents).toBeGreaterThan(0)
    expect(monthPoint(i3, '2026-11-01').requiredCents).toBe(0)
  })

  it('a release (goal completed or archived) is not counted as a withdrawal', () => {
    const i4 = input([g], [row('g1', '2026-10-01', 100_000, 0, 100_000)])
    expect(monthPoint(i4, '2026-10-01').savedCents).toBe(100_000_00)
  })

  it('crosses years without errors', () => {
    const jan = monthPoint(inp, '2027-01-01')
    expect(jan.kind).toBe('future')
    expect(jan.requiredCents).toBe(290_000_00)
    expect(monthPoint(inp, '2026-12-31').month).toBe('2026-12-01')
  })

  it('the scale is the tallest bar across the range, shared by saved and required', () => {
    const max = scaleMax(inp, '2026-09-01', '2027-01-01')
    expect(max).toBe(
      Math.max(
        ...['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'].map((m) => {
          const p = monthPoint(inp, m)
          return Math.max(p.requiredCents, p.savedCents ?? 0)
        }),
      ),
    )
    expect(max).toBeGreaterThan(0)
    expect(scaleMax(input([], []), '2026-09-01', '2027-01-01')).toBe(0)
  })
})

describe('monthVerdict', () => {
  const base = {
    month: '2026-10-01',
    kind: 'past' as const,
    goalsExisted: 1,
    goalsPlanned: 1,
    hasRecords: true,
  }
  it('met, with what was extra', () => {
    expect(monthVerdict({ ...base, savedCents: 250_000_00, requiredCents: 200_000_00 })).toEqual({
      kind: 'met',
      savedCents: 250_000_00,
      requiredCents: 200_000_00,
      extraCents: 50_000_00,
    })
  })
  it('short, with what was missing: Ahorrado 150.000, Necesario 200.000, te faltaron 50.000', () => {
    expect(monthVerdict({ ...base, savedCents: 150_000_00, requiredCents: 200_000_00 })).toEqual({
      kind: 'short',
      savedCents: 150_000_00,
      requiredCents: 200_000_00,
      missingCents: 50_000_00,
      open: false,
    })
  })
  it('the current month is still open', () => {
    expect(
      monthVerdict({ ...base, kind: 'current', savedCents: 0, requiredCents: 200_000_00 }),
    ).toMatchObject({ kind: 'short', open: true })
  })
  it('a negative net month reads as zero saved', () => {
    expect(monthVerdict({ ...base, savedCents: -5_000_00, requiredCents: 100_00 })).toMatchObject({
      kind: 'short',
      savedCents: 0,
    })
  })
  it('without any dated goal there is nothing to compare', () => {
    expect(monthVerdict({ ...base, savedCents: 80_000_00, requiredCents: 0 })).toEqual({
      kind: 'no_plan',
      savedCents: 80_000_00,
    })
  })
  it('a future month is a projection', () => {
    expect(
      monthVerdict({ ...base, kind: 'future', savedCents: null, requiredCents: 90_00 }),
    ).toEqual({ kind: 'future', requiredCents: 90_00 })
  })
})

describe('planNow: how the person is doing', () => {
  const g = goal({ reservedCents: 0, targetDate: '2027-01-31' })

  it('without active goals there is nothing to evaluate', () => {
    expect(planNow(input([], [])).status).toBe('empty')
    expect(planNow(input([goal({ status: 'archived' })], [])).status).toBe('empty')
  })

  it('"Vas al día" only when this month already meets the plan', () => {
    const met = planNow(
      input([goal({ reservedCents: 400_000_00 })], [row('g1', '2026-11-01', 400_000)]),
    )
    expect(met.status).toBe('on_track')
    expect(met.missingCents).toBe(0)
  })

  it('not claimed at the start of the month with nothing saved: it is still pending', () => {
    const early = planNow(input([g], [], { g1: life('2026-11-01T10:00:00Z') }, '2026-11-03'))
    expect(early.status).toBe('pending')
    expect(early.missingCents).toBe(400_000_00)
  })

  it('late in the month and below the plan: needs to save a bit more', () => {
    const late = planNow(
      input(
        [goal({ reservedCents: 100_000_00 })],
        [row('g1', '2026-11-01', 100_000)],
        {},
        '2026-11-25',
      ),
    )
    expect(late.status).toBe('behind')
    expect(late.missingCents).toBe(late.requiredCents - 100_000_00)
  })

  it('a month that fell short last time puts the person behind from the start', () => {
    const rows = [row('g1', '2026-10-01', 50_000)]
    const behind = planNow(input([goal({ reservedCents: 50_000_00 })], rows, {}, '2026-11-02'))
    expect(behind.lastMonthShortCents).toBeGreaterThan(0)
    expect(behind.status).toBe('behind')
  })

  it('all active goals reached: goal achieved', () => {
    expect(
      planNow(input([goal({ reservedCents: 1_200_000_00 })], [row('g1', '2026-10-01', 1_200_000)]))
        .status,
    ).toBe('done')
  })

  it('attention beats everything else', () => {
    const soon = goal({ targetDate: '2026-12-31', reservedCents: 300_000_00 })
    const now = planNow(input([soon], [row('g1', '2026-11-01', 300_000)], {}, '2026-11-02'))
    expect(now.status).toBe('attention')
    expect(now.focus?.goal.id).toBe(soon.id)
  })

  it('goals without dates give no plan to measure', () => {
    expect(planNow(input([goal({ targetDate: null, reservedCents: 10_00 })], [])).status).toBe(
      'no_plan',
    )
  })

  it('changes when the goals change', () => {
    const before = planNow(input([g], []))
    const after = planNow(
      input([g, goal({ id: 'g2', targetCents: 600_000_00, targetDate: '2026-12-31' })], []),
    )
    expect(after.requiredCents).toBeGreaterThan(before.requiredCents)
  })
})

describe('recommend: every sentence comes from the numbers', () => {
  it('is advice about the real rate and date', () => {
    const g = goal({ name: 'Computadora', reservedCents: 0, targetDate: '2027-01-31' })
    const r = recommend(planNow(input([g], [], { g1: life('2026-11-01T10:00:00Z') }, '2026-11-03')))
    expect(r.kind).toBe('rate')
    expect(r.text).toBe(
      `Para llegar a tu meta Computadora en enero de 2027, necesitás reservar ${formatArs(400_000_00)} por mes.`,
    )
    expect(r.goalId).toBe(g.id)
  })

  it('congratulates the month only when the plan is met', () => {
    const r = recommend(
      planNow(input([goal({ reservedCents: 400_000_00 })], [row('g1', '2026-11-01', 400_000)])),
    )
    expect(r).toMatchObject({
      kind: 'month_met',
      text: '¡Cumpliste tu objetivo de ahorro de este mes!',
    })
  })

  it('says how much below the plan the month is', () => {
    const r = recommend(
      planNow(
        input(
          [goal({ reservedCents: 370_000_00 })],
          [row('g1', '2026-10-01', 340_000), row('g1', '2026-11-01', 30_000)],
          {},
          '2026-11-26',
        ),
      ),
    )
    expect(r.kind).toBe('month_short')
    expect(r.text).toMatch(/^Este mes ahorraste \$/)
    expect(r.text).toMatch(/menos de lo planificado\.$/)
  })

  it('reminds about last month before asking for more', () => {
    const r = recommend(
      planNow(
        input(
          [goal({ reservedCents: 50_000_00 })],
          [row('g1', '2026-10-01', 50_000)],
          {},
          '2026-11-02',
        ),
      ),
    )
    expect(r.kind).toBe('last_month_short')
    expect(r.text).toMatch(/^El mes pasado ahorraste/)
  })

  it('attention names the goal, the months left and what to reserve', () => {
    const g = goal({ name: 'Casa', targetDate: '2026-12-31', reservedCents: 300_000_00 })
    const r = recommend(planNow(input([g], [row('g1', '2026-10-01', 300_000)])))
    expect(r.kind).toBe('attention')
    expect(r.text).toContain('Tu meta Casa necesita atención')
    expect(r.text).toContain('quedan 2 meses')
  })

  it('explains an expired goal and a goal without date instead of calculating', () => {
    expect(
      recommend(planNow(input([goal({ name: 'Viejo', targetDate: '2026-09-30' })], []))).kind,
    ).toBe('overdue')
    const r = recommend(
      planNow(input([goal({ name: 'Casa', targetDate: null, reservedCents: 300_000_00 })], [])),
    )
    expect(r.kind).toBe('no_date')
    expect(r.text).toBe(
      'Tu meta Casa está al 25%. Ponele una fecha para saber cuánto reservar por mes.',
    )
  })

  it('invites to create a goal when there are none', () => {
    expect(recommend(planNow(input([], []))).kind).toBe('empty')
  })
})

describe('simulate: what would happen saving a monthly amount (never changes the goal)', () => {
  const g = goal({ reservedCents: 200_000_00, targetCents: 1_200_000_00, targetDate: '2027-01-31' })

  it('says when the goal would be reached and whether that is on time', () => {
    expect(simulate(g, 500_000_00, TODAY)).toEqual({
      months: 2,
      reachedMonth: '2026-12-01',
      onTime: true,
      monthsLate: 0,
    })
    expect(simulate(g, 250_000_00, TODAY)).toEqual({
      months: 4,
      reachedMonth: '2027-02-01',
      onTime: false,
      monthsLate: 1,
    })
  })

  it('saving exactly what is needed arrives in the target month', () => {
    expect(simulate(g, perMonth(1_000_000_00, 3), TODAY)).toMatchObject({
      reachedMonth: '2027-01-01',
      onTime: true,
    })
  })

  it('without a date there is no "on time", only an estimate', () => {
    expect(simulate({ ...g, targetDate: null }, 100_000_00, TODAY)).toMatchObject({
      months: 10,
      onTime: null,
    })
  })

  it('nothing to simulate with zero', () => {
    expect(simulate(g, 0, TODAY)).toBeNull()
  })

  it('an already reached goal needs no months', () => {
    expect(simulate({ ...g, reservedCents: 1_200_000_00 }, 100_00, TODAY)).toMatchObject({
      months: 0,
    })
  })
})

describe('averageSaved', () => {
  it('averages the last closed months that have records', () => {
    const rows = [
      row('g1', '2026-08-01', 100_000),
      row('g1', '2026-09-01', 50_000),
      row('g1', '2026-10-01', 150_000),
    ]
    expect(averageSaved('g1', TODAY, rows)).toBe(100_000_00)
  })
  it('is zero without history', () => {
    expect(averageSaved('g1', TODAY, [])).toBe(0)
  })
})

describe('parsePlanData', () => {
  it('converts what the database reports', () => {
    const data = parsePlanData({
      months: [
        { goal_id: 'g1', month: '2026-10-01', deposited: '150000.50', withdrawn: 0, released: '0' },
      ],
      goals: [
        {
          id: 'g1',
          created_at: '2026-08-10T12:00:00Z',
          completed_at: null,
          archived_at: null,
          paused_at: null,
        },
      ],
    })
    expect(data.months[0]).toEqual({
      goalId: 'g1',
      month: '2026-10-01',
      depositedCents: 15_000_050,
      withdrawnCents: 0,
      releasedCents: 0,
    })
    expect(data.lives.g1?.createdAt).toBe('2026-08-10T12:00:00Z')
  })
})
