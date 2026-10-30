import type { SavingsAccount, SavingsGoal, SavingsMovement, SavingsOverview } from './savings'

/** Test factories for savings goals. */
export const makeGoal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'g1',
  name: 'Viaje',
  icon: 'viaje',
  targetCents: 600_000_00,
  accountId: 'galicia',
  accountName: 'Galicia',
  accountKind: 'bank',
  accountUsable: true,
  targetDate: null,
  frequency: 'free',
  suggestedCents: null,
  remind: false,
  anchorOn: null,
  nextReminderOn: null,
  reminderOn: null,
  status: 'active',
  reservedCents: 30_000_00,
  ...over,
})

export const makeSavingsAccount = (over: Partial<SavingsAccount> = {}): SavingsAccount => ({
  id: 'galicia',
  name: 'Galicia',
  kind: 'bank',
  archived: false,
  balanceCents: 150_000_00,
  reservedCents: 30_000_00,
  freeCents: 120_000_00,
  ...over,
})

export const makeMovement = (over: Partial<SavingsMovement> = {}): SavingsMovement => ({
  id: 'm1',
  goalId: 'g1',
  kind: 'deposit',
  amountCents: 30_000_00,
  occurredOn: '2026-11-03',
  note: null,
  status: 'posted',
  ...over,
})

export const makeSavings = (over: Partial<SavingsOverview> = {}): SavingsOverview => ({
  today: '2026-11-10',
  goals: [],
  accounts: [],
  movements: [],
  ...over,
})
