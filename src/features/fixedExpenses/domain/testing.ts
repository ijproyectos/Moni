import type { FixedExpense, FixedExpenseOverview, Occurrence, Payment } from './fixedExpense'

/** Test factories for fixed expenses (kept next to the domain, like the other features' testing helpers). */
export const makeExpense = (over: Partial<FixedExpense> = {}): FixedExpense => ({
  id: 'f1',
  kindId: 'luz',
  name: 'Luz',
  amountCents: 30_000_00,
  period: 'monthly',
  nextDueOn: '2026-12-05',
  accountId: 'galicia',
  accountName: 'Galicia',
  accountKind: 'bank',
  categoryId: 'c1',
  remind: true,
  status: 'active',
  ...over,
})

export const makeOccurrence = (over: Partial<Occurrence> = {}): Occurrence => ({
  id: 'o1',
  fixedExpenseId: 'f1',
  dueOn: '2026-11-05',
  rescheduledTo: null,
  expectedCents: 30_000_00,
  status: 'pending',
  note: null,
  ...over,
})

export const makePayment = (over: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  occurrenceId: 'o1',
  fixedExpenseId: 'f1',
  source: 'registered',
  status: 'posted',
  amountCents: 31_500_00,
  paidOn: '2026-11-07',
  accountId: 'galicia',
  accountName: 'Galicia',
  transactionId: 't1',
  voidedElsewhere: false,
  ...over,
})

export const makeOverview = (over: Partial<FixedExpenseOverview> = {}): FixedExpenseOverview => ({
  today: '2026-11-10',
  expenses: [],
  occurrences: [],
  payments: [],
  ...over,
})
