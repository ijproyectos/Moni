import {
  buildInstallmentSchedule,
  closingAfter,
  dueFor,
  firstClosingOptions,
  statementClosingFor,
} from './cardCalendar'

// The same cases run against the SQL functions in supabase tests (PGlite): both must agree.
describe('statementClosingFor', () => {
  it('puts a purchase made on the closing day in that statement', () => {
    expect(statementClosingFor('2026-10-15', 15)).toBe('2026-10-15')
  })
  it('puts the next day in the following statement, across year ends too', () => {
    expect(statementClosingFor('2026-10-16', 15)).toBe('2026-11-15')
    expect(statementClosingFor('2026-12-20', 15)).toBe('2027-01-15')
  })
  it('moves days 29-31 to the last day of short months', () => {
    expect(statementClosingFor('2026-02-10', 31)).toBe('2026-02-28')
    expect(statementClosingFor('2026-02-28', 31)).toBe('2026-02-28')
    expect(statementClosingFor('2028-02-10', 30)).toBe('2028-02-29')
  })
})

describe('dueFor', () => {
  it('is the first due day strictly after closing', () => {
    expect(dueFor('2026-10-25', 5)).toBe('2026-11-05')
    expect(dueFor('2026-10-05', 25)).toBe('2026-10-25')
    expect(dueFor('2026-10-05', 5)).toBe('2026-11-05')
    expect(dueFor('2026-01-31', 31)).toBe('2026-02-28')
  })
})

describe('closingAfter', () => {
  it('does not drift after a short month', () => {
    expect(closingAfter('2026-01-31', 31, 1)).toBe('2026-02-28')
    expect(closingAfter('2026-01-31', 31, 2)).toBe('2026-03-31')
    expect(closingAfter('2026-11-25', 25, -1)).toBe('2026-10-25')
  })
})

describe('firstClosingOptions', () => {
  it('offers one statement earlier and up to two later', () => {
    expect(firstClosingOptions('2026-11-25', 25)).toEqual([
      '2026-10-25',
      '2026-11-25',
      '2026-12-25',
      '2027-01-25',
    ])
  })
})

describe('buildInstallmentSchedule', () => {
  const base = { closingDay: 25, dueDay: 5, firstClosing: '2026-11-25' as const }

  it('12 installments of 70.000 for 840.000, one per statement', () => {
    const rows = buildInstallmentSchedule({
      ...base,
      totalCents: 840_000_00,
      count: 12,
      current: 1,
    })
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.amountCents === 70_000_00)).toBe(true)
    expect(rows[0]).toMatchObject({ number: 1, closingOn: '2026-11-25', dueOn: '2026-12-05' })
    expect(rows[11]).toMatchObject({ number: 12, closingOn: '2027-10-25', dueOn: '2027-11-05' })
  })

  it('"voy en la 4" records only installments 4 to 12', () => {
    const rows = buildInstallmentSchedule({
      ...base,
      totalCents: 840_000_00,
      count: 12,
      current: 4,
    })
    expect(rows.map((r) => r.number)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(rows[0]?.closingOn).toBe('2026-11-25')
  })

  it('splits cents exactly: the first installments carry the leftover', () => {
    const all = buildInstallmentSchedule({ ...base, totalCents: 100_00, count: 3, current: 1 })
    expect(all.map((r) => r.amountCents)).toEqual([33_34, 33_33, 33_33])
    const rest = buildInstallmentSchedule({ ...base, totalCents: 100_00, count: 3, current: 2 })
    expect(rest.map((r) => r.amountCents)).toEqual([33_33, 33_33])
  })

  it('returns nothing for invalid input', () => {
    expect(buildInstallmentSchedule({ ...base, totalCents: 0, count: 12, current: 1 })).toEqual([])
    expect(buildInstallmentSchedule({ ...base, totalCents: 100, count: 1, current: 1 })).toEqual([])
    expect(buildInstallmentSchedule({ ...base, totalCents: 100, count: 3, current: 4 })).toEqual([])
  })
})
