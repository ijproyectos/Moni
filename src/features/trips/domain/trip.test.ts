import { makeTransaction } from '@/features/transactions/domain/testing'
import { summarizeTrip, tripExpenses, tripFormSchema, tripStatus, tripTimeLabel } from './trip'

const trip = { startsOn: '2026-12-10', endsOn: '2026-12-19', budgetCents: 500_000_00 }
const expense = (over: Parameters<typeof makeTransaction>[0] = {}) =>
  makeTransaction({ tripId: 't1', kind: 'expense', ...over })

describe('tripFormSchema', () => {
  const ok = { name: ' Salta ', startsOn: '2026-12-10', endsOn: '2026-12-17', budget: '500.000' }

  it('turns the form text into values (trimmed name, integer cents)', () => {
    expect(tripFormSchema.parse(ok)).toEqual({
      name: 'Salta',
      startsOn: '2026-12-10',
      endsOn: '2026-12-17',
      budgetCents: 500_000_00,
    })
  })

  it.each([
    [{ name: '  ' }, 'Contanos a dónde vas.'],
    [{ budget: '' }, 'Poné un presupuesto.'],
    [{ budget: '0' }, 'Poné un presupuesto.'],
    [{ endsOn: '2026-12-09' }, 'La vuelta no puede ser antes de la ida.'],
  ])('rejects %j with a clear message', (patch, message) => {
    const result = tripFormSchema.safeParse({ ...ok, ...patch })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(message)
  })
})

describe('tripStatus / tripTimeLabel', () => {
  it('is upcoming, ongoing or ended by the dates (both ends included)', () => {
    expect(tripStatus(trip, '2026-12-09')).toBe('upcoming')
    expect(tripStatus(trip, '2026-12-10')).toBe('ongoing')
    expect(tripStatus(trip, '2026-12-19')).toBe('ongoing')
    expect(tripStatus(trip, '2026-12-20')).toBe('ended')
  })

  it('says how far the trip is', () => {
    const at = (today: string) => tripTimeLabel(trip, summarizeTrip(trip, [], today), today)
    expect(at('2026-11-30')).toBe('Faltan 10 días')
    expect(at('2026-12-09')).toBe('Falta 1 día')
    expect(at('2026-12-12')).toBe('Quedan 8 días')
    expect(at('2026-12-19')).toBe('Último día')
    expect(at('2026-12-25')).toBe('Terminó')
  })
})

describe('tripExpenses', () => {
  it('keeps only the posted plain expenses of that trip', () => {
    const mine = expense({ id: 'a' })
    const list = [
      mine,
      expense({ id: 'b', tripId: 't2' }),
      expense({ id: 'c', status: 'voided' }),
      makeTransaction({ id: 'd', kind: 'income', tripId: 't1' }),
      makeTransaction({ id: 'e', kind: 'expense' }),
    ]
    expect(tripExpenses('t1', list)).toEqual([mine])
  })
})

describe('summarizeTrip', () => {
  it('adds up what was really spent against the budget', () => {
    const s = summarizeTrip(
      trip,
      [expense({ amountCents: 120_000_00 }), expense({ amountCents: 30_000_00 })],
      '2026-12-12',
    )
    expect(s.spentCents).toBe(150_000_00)
    expect(s.remainingCents).toBe(350_000_00)
    expect(s.progress).toBeCloseTo(0.3)
    expect(s.overBudget).toBe(false)
    expect(s.expenseCount).toBe(2)
    expect(s.status).toBe('ongoing')
  })

  it('suggests what is left per remaining day, counting today', () => {
    const s = summarizeTrip(trip, [expense({ amountCents: 150_000_00 })], '2026-12-12')
    expect(s.daysLeft).toBe(8)
    expect(s.perDayCents).toBe(Math.floor(350_000_00 / 8))
  })

  it('before the trip starts it spreads the budget over all its days', () => {
    const s = summarizeTrip(trip, [], '2026-11-01')
    expect(s.totalDays).toBe(10)
    expect(s.daysLeft).toBe(10)
    expect(s.perDayCents).toBe(50_000_00)
  })

  it('flags a budget that was exceeded, with nothing left to suggest', () => {
    const s = summarizeTrip(trip, [expense({ amountCents: 520_000_00 })], '2026-12-12')
    expect(s.overBudget).toBe(true)
    expect(s.remainingCents).toBe(-20_000_00)
    expect(s.perDayCents).toBe(0)
  })

  it('an ended trip has no days left and suggests nothing', () => {
    const s = summarizeTrip(trip, [expense({ amountCents: 10_000_00 })], '2026-12-30')
    expect(s.status).toBe('ended')
    expect(s.daysLeft).toBe(0)
    expect(s.perDayCents).toBe(0)
  })

  it('groups the spending by category, biggest first, with its share', () => {
    const s = summarizeTrip(
      trip,
      [
        expense({ categoryId: 'food', amountCents: 30_000_00 }),
        expense({ categoryId: 'bus', amountCents: 60_000_00 }),
        expense({ categoryId: 'food', amountCents: 10_000_00 }),
      ],
      '2026-12-12',
    )
    expect(s.byCategory).toEqual([
      { categoryId: 'bus', cents: 60_000_00, share: 0.6 },
      { categoryId: 'food', cents: 40_000_00, share: 0.4 },
    ])
  })

  it('with no expenses there is nothing to group and no division by zero', () => {
    const s = summarizeTrip(trip, [], '2026-12-12')
    expect(s.byCategory).toEqual([])
    expect(s.progress).toBe(0)
  })
})
