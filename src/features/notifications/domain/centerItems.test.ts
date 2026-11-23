import type { Notice } from '@/features/debts/domain/debts'
import type { BudgetStatus } from '@/features/budgets/domain/budget'
import type { Subscription, SubscriptionCharge } from '@/features/subscriptions/domain/subscription'
import { buildCenterItems, unreadCount } from './centerItems'

const TODAY = '2026-11-20'

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's1', serviceId: 'netflix', name: 'Netflix', plan: null, amountCents: 10_000_00, period: 'monthly', nextChargeOn: '2026-11-22',
  accountId: 'a', accountName: 'Banco', accountKind: 'bank', categoryId: 'c', remind: true, status: 'active', ...over,
})
const charge = (over: Partial<SubscriptionCharge>): SubscriptionCharge => ({
  id: 'c1', subscriptionId: 's1', dueOn: '2026-11-01', amountCents: 8_000_00, status: 'posted', voidedElsewhere: false, failureReason: null,
  negativeBalance: false, overLimit: false, balanceAfterCents: null, possibleDuplicate: null, ...over,
})
const notice = (over: Partial<Notice> = {}): Notice =>
  ({ id: 'n1', kind: 'join_approved', groupId: 'g', groupName: 'IJ', actorId: 'u', actorName: 'Ana', amountCents: 0, reportId: null, readAt: null, createdAt: '2026-11-19T10:00:00Z', ...over }) as Notice
const budget = (over: Partial<BudgetStatus> = {}): BudgetStatus =>
  ({ budgetId: 'b', categoryId: 'cat', name: 'Comida', color: '#fff', icon: 'Utensils', amountCents: 100, spentCents: 50, remainingCents: 50, percent: 50, state: 'ok', ...over }) as BudgetStatus

describe('buildCenterItems', () => {
  it('is empty without real events: nothing is invented', () => {
    expect(buildCenterItems({ today: TODAY, notices: [], subscriptions: [], charges: [], budgets: [] })).toEqual([])
  })

  it('turns real events into notices: group notices, a charge due soon, a price increase and a category over its limit', () => {
    const items = buildCenterItems({
      today: TODAY,
      notices: [notice()],
      subscriptions: [sub()],
      charges: [charge({ id: 'c0', dueOn: '2026-10-01', amountCents: 8_000_00 }), charge({ id: 'c1', dueOn: '2026-11-01', amountCents: 10_000_00 })],
      budgets: [budget({ state: 'over' }), budget({ categoryId: 'x', name: 'Súper', state: 'ok' })],
    })
    expect(items.map((i) => i.kind).sort()).toEqual(['budget', 'group', 'payment_due', 'price_increase'])
    expect(items.find((i) => i.kind === 'price_increase')?.text).toBe('Netflix subió de $8.000 a $10.000.')
    expect(items.find((i) => i.kind === 'payment_due')?.to).toBe('/recurrentes')
    expect(items.find((i) => i.kind === 'group')?.to).toBe('/grupos/avisos?aviso=n1')
  })

  it('does not repeat an event and ignores paused subscriptions, far charges and price drops', () => {
    const items = buildCenterItems({
      today: TODAY,
      notices: [],
      subscriptions: [sub({ status: 'paused' }), sub({ id: 's2', nextChargeOn: '2026-12-30' })],
      charges: [charge({ subscriptionId: 's2', dueOn: '2026-11-01', amountCents: 5_000_00 }), charge({ id: 'c9', subscriptionId: 's2', dueOn: '2026-10-01', amountCents: 9_000_00 })],
      budgets: [],
    })
    expect(items).toEqual([])
  })

  it('counts unread: notices by the database, the rest by what this device marked', () => {
    const items = buildCenterItems({ today: TODAY, notices: [notice(), notice({ id: 'n2', readAt: '2026-11-19T12:00:00Z' })], subscriptions: [sub()], charges: [], budgets: [] })
    expect(unreadCount(items, new Set())).toBe(2)
    expect(unreadCount(items, new Set(items.filter((i) => i.source === 'derived').map((i) => i.key)))).toBe(1)
  })
})

describe('buildCenterItems: preferences', () => {
  it('leaves out what the person turned off, and keeps the notices of groups', () => {
    const input = {
      today: TODAY,
      notices: [notice()],
      subscriptions: [sub()],
      charges: [charge({ id: 'c0', dueOn: '2026-10-01', amountCents: 8_000_00 }), charge({ id: 'c1', dueOn: '2026-11-01', amountCents: 10_000_00 })],
      budgets: [budget({ state: 'over' })],
    }
    const items = buildCenterItems({ ...input, show: { paymentsDue: false, priceChanges: false, budgets: false } })
    expect(items.map((i) => i.kind)).toEqual(['group'])
    expect(buildCenterItems({ ...input, show: { paymentsDue: true, priceChanges: false, budgets: false } }).map((i) => i.kind).sort()).toEqual(['group', 'payment_due'])
  })
})
