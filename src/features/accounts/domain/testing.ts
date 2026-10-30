import type { Account } from './account'

/** Test factory for domain accounts. */
export const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'a',
  name: 'Efectivo',
  kind: 'cash',
  currency: 'ARS',
  openingBalanceCents: 0,
  balanceCents: 0,
  archivedAt: null,
  creditLimitCents: null,
  closingDay: null,
  dueDay: null,
  transferAlias: null,
  transferCbu: null,
  ...overrides,
})
