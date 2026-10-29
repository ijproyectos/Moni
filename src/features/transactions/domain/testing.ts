import type { Transaction } from './transaction'

/** Test factory for domain transactions. */
export const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  accountId: '11111111-1111-4111-8111-111111111111',
  categoryId: '22222222-2222-4222-8222-222222222222',
  kind: 'expense',
  amountCents: 10000,
  occurredOn: '2026-10-10',
  note: null,
  status: 'posted',
  voidedAt: null,
  sharedExpenseId: null,
  statementClosingOn: null,
  installmentPlanId: null,
  installmentNumber: null,
  installmentsTotal: null,
  createdAt: '2026-10-10T12:00:00Z',
  ...overrides,
})
