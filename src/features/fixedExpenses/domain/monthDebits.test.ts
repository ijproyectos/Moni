import { debitStatusText, monthDebits, nextDebitText } from './monthDebits'
import { makeExpense, makeOccurrence, makeOverview, makePayment } from './testing'

// today = 2026-11-10 (Tuesday)
const luz = makeExpense({ id: 'luz', name: 'Luz', nextDueOn: '2026-12-05' })
const flow = makeExpense({ id: 'flow', name: 'Flow', nextDueOn: '2026-11-13', amountCents: 24_900_00 })
const netflix = makeExpense({ id: 'nf', name: 'Netflix', nextDueOn: '2026-11-28', amountCents: 14_000_00 })
const gas = makeExpense({ id: 'gas', name: 'Gas', status: 'paused', nextDueOn: '2026-11-12' })

const overview = makeOverview({
  expenses: [luz, flow, netflix, gas],
  occurrences: [
    makeOccurrence({ id: 'o-luz', fixedExpenseId: 'luz', dueOn: '2026-11-05', expectedCents: 30_000_00 }),
    makeOccurrence({ id: 'o-paid', fixedExpenseId: 'luz', dueOn: '2026-11-01', status: 'paid' }),
  ],
  payments: [
    makePayment({ id: 'p1', occurrenceId: 'o-paid', fixedExpenseId: 'luz', amountCents: 50_000_00, paidOn: '2026-11-02' }),
    makePayment({ id: 'p2', occurrenceId: 'o-paid', fixedExpenseId: 'luz', amountCents: 9_000_00, paidOn: '2026-11-03', status: 'voided' }),
    makePayment({ id: 'p3', occurrenceId: 'o-paid', fixedExpenseId: 'luz', amountCents: 7_000_00, paidOn: '2026-10-03' }),
  ],
})

describe('monthDebits', () => {
  const result = monthDebits(overview)

  it('adds what was really paid this month and what is still to be debited', () => {
    expect(result.paidCents).toBe(50_000_00)
    // Luz overdue 30.000 + Flow 24.900 + Netflix 14.000; the paused one and next month's are out.
    expect(result.pendingCents).toBe(68_900_00)
    expect(result.totalCents).toBe(118_900_00)
  })

  it('orders the month by date with its status', () => {
    expect(result.rows.map((r) => [r.expense.name, r.status])).toEqual([
      ['Luz', 'paid'],
      ['Luz', 'overdue'],
      ['Flow', 'soon'],
      ['Netflix', 'later'],
    ])
  })

  it('names the next debit that has not happened yet, never an overdue one', () => {
    expect(result.next?.expense.name).toBe('Flow')
    expect(nextDebitText(result.next as NonNullable<typeof result.next>)).toBe('El viernes se debita Flow.')
  })

  it('keeps what is due after this month apart', () => {
    expect(result.later.map((e) => e.name)).toEqual(['Luz'])
  })

  it('reads each state plainly', () => {
    const texts = result.rows.map(debitStatusText)
    expect(texts).toEqual(['Pagado', 'Vencido hace 5 días', 'En 3 días', '28 nov'])
  })

  it('has no next debit when everything is paid', () => {
    const empty = monthDebits(makeOverview({ expenses: [luz], occurrences: [], payments: [] }))
    expect(empty.next).toBeNull()
    expect(empty.totalCents).toBe(0)
  })
})
