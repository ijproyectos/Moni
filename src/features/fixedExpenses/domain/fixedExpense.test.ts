import {
  daysBetween,
  dueState,
  effectiveDate,
  fixedReminders,
  historyItems,
  monthlyEstimateCents,
  paidInMonthCents,
  parseFixedExpenseOverview,
  pendingBills,
  splitPendingBills,
  upcomingExpenses,
  type FixedExpense,
  type FixedExpenseOverview,
  type Occurrence,
  type Payment,
} from './fixedExpense'
import { billLabel, FIXED_KINDS, findKind } from './catalog'
import { dueText, paymentQuestion } from './labels'

const expense = (over: Partial<FixedExpense> = {}): FixedExpense => ({
  id: 'f1',
  kindId: 'luz',
  name: 'Luz',
  amountCents: 30_000_00,
  period: 'monthly',
  nextDueOn: '2026-12-05',
  accountId: 'a1',
  accountName: 'Galicia',
  accountKind: 'bank',
  categoryId: 'c1',
  remind: true,
  status: 'active',
  ...over,
})
const occ = (over: Partial<Occurrence> = {}): Occurrence => ({
  id: 'o1',
  fixedExpenseId: 'f1',
  dueOn: '2026-11-05',
  rescheduledTo: null,
  expectedCents: 30_000_00,
  status: 'pending',
  note: null,
  ...over,
})
const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  occurrenceId: 'o1',
  fixedExpenseId: 'f1',
  source: 'registered',
  status: 'posted',
  amountCents: 31_500_00,
  paidOn: '2026-11-07',
  accountId: 'a1',
  accountName: 'Galicia',
  transactionId: 't1',
  voidedElsewhere: false,
  ...over,
})
const overview = (over: Partial<FixedExpenseOverview> = {}): FixedExpenseOverview => ({
  today: '2026-11-10',
  expenses: [expense()],
  occurrences: [],
  payments: [],
  ...over,
})

describe('fixed expense catalog', () => {
  it('has every requested kind, each with an icon, and no company logos', () => {
    expect(FIXED_KINDS.map((k) => k.name)).toEqual([
      'Luz',
      'Agua',
      'Gas',
      'Internet',
      'Celular',
      'Alquiler',
      'Expensas',
      'Seguros',
      'Educación',
      'Impuestos y tasas',
      'Otros gastos fijos',
    ])
    expect(
      FIXED_KINDS.every((k) => typeof k.icon === 'object' || typeof k.icon === 'function'),
    ).toBe(true)
    expect(new Set(FIXED_KINDS.map((k) => k.id)).size).toBe(FIXED_KINDS.length)
    expect(findKind('luz')?.name).toBe('Luz')
    expect(findKind('nope')).toBeUndefined()
  })

  it('names a utility as a bill and anything else by its name', () => {
    expect(billLabel('luz', 'Luz')).toBe('tu factura de luz')
    expect(billLabel('alquiler', 'Alquiler')).toBe('Alquiler')
    expect(billLabel('custom', 'Patente')).toBe('Patente')
  })
})

describe('dates and states', () => {
  it('classifies a date against today', () => {
    expect(dueState('2026-11-09', '2026-11-10')).toBe('overdue')
    expect(dueState('2026-11-10', '2026-11-10')).toBe('today')
    expect(dueState('2026-11-11', '2026-11-10')).toBe('tomorrow')
    expect(dueState('2026-11-12', '2026-11-10')).toBe('later')
    expect(dueState('2026-12-01', '2026-11-30')).toBe('tomorrow')
    expect(dueState('2026-12-02', '2026-11-30')).toBe('later')
    expect(dueState('2027-01-01', '2026-12-31')).toBe('tomorrow')
  })

  it('counts whole days and uses the moved date when there is one', () => {
    expect(daysBetween('2026-11-05', '2026-11-10')).toBe(5)
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3)
    expect(effectiveDate(occ())).toBe('2026-11-05')
    expect(effectiveDate(occ({ rescheduledTo: '2026-11-20' }))).toBe('2026-11-20')
  })
})

describe('totals: estimated is apart from really paid', () => {
  it('estimates per month from the ACTIVE ones only (bimonthly / 2, yearly / 12), in whole pesos', () => {
    const list = [
      expense({ amountCents: 30_000_00 }),
      expense({ id: 'f2', period: 'bimonthly', amountCents: 20_000_00 }),
      expense({ id: 'f3', period: 'yearly', amountCents: 95_000_00 }),
      expense({ id: 'f4', status: 'paused', amountCents: 999_999_00 }),
      expense({ id: 'f5', status: 'removed', amountCents: 999_999_00 }),
    ]
    expect(monthlyEstimateCents(list)).toBe(30_000_00 + 10_000_00 + 7_917_00)
  })

  it('adds up what was really paid in the current month by PAYMENT date, ignoring voided ones', () => {
    const payments = [
      pay({ amountCents: 31_500_00, paidOn: '2026-11-07' }),
      pay({ id: 'p2', amountCents: 5_000_00, paidOn: '2026-11-02' }),
      pay({ id: 'p3', amountCents: 9_999_00, paidOn: '2026-10-30' }),
      pay({ id: 'p4', amountCents: 8_000_00, paidOn: '2026-11-03', status: 'voided' }),
      pay({ id: 'p5', amountCents: 7_000_00, paidOn: '2026-11-04', voidedElsewhere: true }),
    ]
    expect(paidInMonthCents(payments, '2026-11-10')).toBe(36_500_00)
  })
})

describe('pending bills', () => {
  it('lists the pending ones, overdue first, with the days late', () => {
    const o = overview({
      occurrences: [
        occ({ id: 'late', dueOn: '2026-11-01' }),
        occ({ id: 'now', dueOn: '2026-11-10' }),
        occ({ id: 'soon', dueOn: '2026-11-11' }),
        occ({ id: 'paid', dueOn: '2026-10-05', status: 'paid' }),
        occ({ id: 'skipped', dueOn: '2026-09-05', status: 'skipped' }),
      ],
    })
    const bills = pendingBills(o)
    expect(bills.map((b) => [b.occurrence.id, b.state, b.daysLate])).toEqual([
      ['late', 'overdue', 9],
      ['now', 'today', 0],
      ['soon', 'tomorrow', 0],
    ])
  })

  it('a moved bill counts for its new date and keeps its original one', () => {
    const [bill] = pendingBills(
      overview({ occurrences: [occ({ dueOn: '2026-11-01', rescheduledTo: '2026-11-20' })] }),
    )
    expect(bill?.date).toBe('2026-11-20')
    expect(bill?.state).toBe('later')
    expect(bill?.occurrence.dueOn).toBe('2026-11-01')
  })

  it('hides bills of an expense whose follow-up was removed', () => {
    expect(
      pendingBills(overview({ expenses: [expense({ status: 'removed' })], occurrences: [occ()] })),
    ).toEqual([])
  })

  it('keeps pending bills of a paused expense, apart from the ones of active expenses', () => {
    const o = overview({
      expenses: [expense({ id: 'f1', status: 'paused' }), expense({ id: 'f2', name: 'Gas' })],
      occurrences: [
        occ({ id: 'old', fixedExpenseId: 'f1' }),
        occ({ id: 'new', fixedExpenseId: 'f2' }),
      ],
    })
    const bills = pendingBills(o)
    expect(bills).toHaveLength(2)
    const { active, paused } = splitPendingBills(bills)
    expect(active.map((b) => b.occurrence.id)).toEqual(['new'])
    expect(paused.map((b) => b.occurrence.id)).toEqual(['old'])
  })
})

describe('upcoming and history', () => {
  it('upcoming: active only, by next due date', () => {
    const list = upcomingExpenses([
      expense({ id: 'b', name: 'Gas', nextDueOn: '2026-12-20' }),
      expense({ id: 'a', name: 'Luz', nextDueOn: '2026-12-05' }),
      expense({ id: 'c', status: 'paused', nextDueOn: '2026-11-01' }),
    ])
    expect(list.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('history: payments (also voided) and skipped bills, newest first, filterable by expense', () => {
    const o = overview({
      expenses: [expense(), expense({ id: 'f2', name: 'Gas' })],
      occurrences: [occ({ id: 's', fixedExpenseId: 'f2', dueOn: '2026-10-20', status: 'skipped' })],
      payments: [
        pay({ id: 'p1', paidOn: '2026-11-07' }),
        pay({ id: 'p2', paidOn: '2026-11-08', status: 'voided' }),
      ],
    })
    const all = historyItems(o)
    expect(all.map((i) => (i.type === 'payment' ? i.payment.id : i.occurrence.id))).toEqual([
      'p2',
      'p1',
      's',
    ])
    expect(historyItems(o, 'f2').map((i) => i.type)).toEqual(['skipped'])
  })
})

describe('reminders: the day before and the due day, in the app only', () => {
  it('reminds a pending bill on its due day with the question, and the day before with the estimate', () => {
    const today = fixedReminders(
      overview({ today: '2026-11-05', expenses: [expense()], occurrences: [occ()] }),
    )
    expect(today.map((r) => r.text)).toEqual(['Hoy vence tu factura de luz. ¿Cuánto pagaste?'])
    const before = fixedReminders(
      overview({ today: '2026-11-04', expenses: [expense()], occurrences: [occ()] }),
    )
    expect(before.map((r) => r.text)).toEqual([
      'Mañana vence tu factura de luz: aprox. $30.000, se paga con Galicia',
    ])
  })

  it('also reminds a due date that has not become a bill yet (next due date)', () => {
    const out = fixedReminders(
      overview({ today: '2026-12-04', expenses: [expense({ nextDueOn: '2026-12-05' })] }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toMatch(/^Mañana vence tu factura de luz/)
  })

  it('follows a moved date and respects "remind: off", paused and removed', () => {
    const moved = occ({ dueOn: '2026-11-01', rescheduledTo: '2026-11-20' })
    expect(fixedReminders(overview({ today: '2026-11-20', occurrences: [moved] }))).toHaveLength(1)
    expect(fixedReminders(overview({ today: '2026-11-01', occurrences: [moved] }))).toHaveLength(0)
    expect(
      fixedReminders(
        overview({
          today: '2026-11-05',
          expenses: [expense({ remind: false })],
          occurrences: [occ()],
        }),
      ),
    ).toEqual([])
    expect(
      fixedReminders(
        overview({
          today: '2026-11-05',
          expenses: [expense({ status: 'removed' })],
          occurrences: [occ()],
        }),
      ),
    ).toEqual([])
  })

  it('names non-utility bills by name', () => {
    const o = overview({
      today: '2026-11-05',
      expenses: [expense({ kindId: 'alquiler', name: 'Alquiler' })],
      occurrences: [occ()],
    })
    expect(fixedReminders(o)[0]?.text).toBe('Hoy vence Alquiler. ¿Cuánto pagaste?')
  })
})

describe('labels', () => {
  const bill = (over: Partial<Occurrence>, today: string) => {
    const [first] = pendingBills(overview({ today, occurrences: [occ(over)] }))
    if (!first) throw new Error('no pending bill')
    return first
  }
  it('says overdue plainly, with the days', () => {
    expect(dueText(bill({}, '2026-11-08'))).toBe('Vencido hace 3 días (5 nov)')
    expect(dueText(bill({}, '2026-11-06'))).toBe('Vencido hace 1 día (5 nov)')
    expect(dueText(bill({}, '2026-11-05'))).toBe('Vence hoy')
    expect(dueText(bill({}, '2026-11-04'))).toBe('Vence mañana')
    expect(dueText(bill({}, '2026-11-01'))).toBe('Vence el 5 nov')
  })
  it('mentions the original date when it was moved', () => {
    expect(dueText(bill({ rescheduledTo: '2026-11-20' }, '2026-11-10'))).toBe(
      'Vence el 20 nov · vencía el 5 nov',
    )
  })
  it('asks "¿Cuánto pagaste?" according to the state', () => {
    expect(paymentQuestion(bill({}, '2026-11-05'))).toBe(
      'Hoy vence tu factura de luz. ¿Cuánto pagaste?',
    )
    expect(paymentQuestion(bill({}, '2026-11-09'))).toBe('Venció el 5 nov. ¿Cuánto pagaste?')
    expect(paymentQuestion(bill({}, '2026-11-01'))).toBe('Vence el 5 nov. ¿Cuánto pagaste?')
  })
})

describe('parseFixedExpenseOverview', () => {
  it('converts the database JSON (pesos) to cents and reads a payment as the movement shows it', () => {
    const parsed = parseFixedExpenseOverview({
      today: '2026-11-10',
      expenses: [
        {
          id: 'f1',
          kind_id: 'luz',
          name: 'Luz',
          amount: 30000,
          period: 'bimonthly',
          next_due_on: '2026-12-05',
          account_id: 'a1',
          account_name: 'Galicia',
          account_kind: 'bank',
          category_id: 'c1',
          remind: true,
          status: 'active',
        },
      ],
      occurrences: [
        {
          id: 'o1',
          fixed_expense_id: 'f1',
          due_on: '2026-11-05',
          rescheduled_to: null,
          expected_amount: 30000.5,
          status: 'pending',
          note: null,
        },
      ],
      payments: [
        {
          id: 'p1',
          occurrence_id: 'o1',
          fixed_expense_id: 'f1',
          source: 'registered',
          status: 'posted',
          amount: 31500.25,
          paid_on: '2026-11-07',
          account_id: 'a1',
          account_name: 'Galicia',
          transaction_id: 't1',
          voided_elsewhere: null,
        },
      ],
    })
    expect(parsed.expenses[0]).toMatchObject({ amountCents: 30_000_00, period: 'bimonthly' })
    expect(parsed.occurrences[0]).toMatchObject({ expectedCents: 30_000_50, status: 'pending' })
    expect(parsed.payments[0]).toMatchObject({
      amountCents: 31_500_25,
      paidOn: '2026-11-07',
      voidedElsewhere: false,
    })
  })

  it('rejects malformed data instead of showing wrong numbers', () => {
    expect(() =>
      parseFixedExpenseOverview({ today: 'x', expenses: [{}], occurrences: [], payments: [] }),
    ).toThrow()
  })
})
