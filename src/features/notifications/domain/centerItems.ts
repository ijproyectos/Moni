import { noticeText, type Notice } from '@/features/debts/domain/debts'
import type { BudgetStatus } from '@/features/budgets/domain/budget'
import {
  chargesOf,
  isEffectiveCharge,
  type Subscription,
  type SubscriptionCharge,
} from '@/features/subscriptions/domain/subscription'
import { formatArs } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'

export type CenterKind = 'group' | 'payment_due' | 'price_increase' | 'budget'

export interface CenterItem {
  /** Stable key: the same event never shows twice, and it is what "read" is remembered by. */
  key: string
  kind: CenterKind
  text: string
  /** Where tapping it goes. */
  to: string
  /** Sort key (ISO date or timestamp), newest first. */
  at: string
  /** Group notices keep their read state in the database; the rest are remembered on this device. */
  source: 'notice' | 'derived'
  /** Only for notices: already read in the database. */
  readInDb?: boolean
}

const DUE_WINDOW_DAYS = 3
const PRICE_WINDOW_DAYS = 45

/**
 * The general notices of Moni Plus, built ONLY from real data: the notices of groups, the subscription charges that are about to
 * happen, a subscription whose charge went up (its last two registered charges), and categories that are close to or over their
 * monthly limit. Nothing is invented: without data the list is empty.
 */
export function buildCenterItems(input: {
  today: IsoDate
  notices: readonly Notice[]
  subscriptions: readonly Subscription[]
  charges: readonly SubscriptionCharge[]
  budgets: readonly BudgetStatus[]
  /** What the person chose to see; everything shows until they turn it off. */
  show?: { paymentsDue: boolean; priceChanges: boolean; budgets: boolean }
}): CenterItem[] {
  const { today, notices, subscriptions, charges, budgets } = input
  const show = input.show ?? { paymentsDue: true, priceChanges: true, budgets: true }
  const items: CenterItem[] = []

  for (const n of notices) {
    items.push({
      key: `notice:${n.id}`,
      kind: 'group',
      text: noticeText(n),
      to: `/grupos/avisos?aviso=${n.id}`,
      at: n.createdAt,
      source: 'notice',
      readInDb: n.readAt !== null,
    })
  }

  const limit = addDays(today, DUE_WINDOW_DAYS)
  for (const s of subscriptions) {
    if (s.status !== 'active') continue
    if (show.paymentsDue && s.nextChargeOn >= today && s.nextChargeOn <= limit) {
      items.push({
        key: `due:${s.id}:${s.nextChargeOn}`,
        kind: 'payment_due',
        text: `${s.name}: se cobra ${formatArs(s.amountCents)} el ${s.nextChargeOn.slice(8, 10)}/${s.nextChargeOn.slice(5, 7)}.`,
        to: '/recurrentes',
        at: `${s.nextChargeOn}T00:00:00Z`,
        source: 'derived',
      })
    }
    const history = chargesOf(charges, s.id)
      .filter(isEffectiveCharge)
      .sort((a, b) => b.dueOn.localeCompare(a.dueOn))
    const [last, before] = history
    if (show.priceChanges && last && before && last.amountCents > before.amountCents && last.dueOn >= addDays(today, -PRICE_WINDOW_DAYS)) {
      items.push({
        key: `price:${s.id}:${last.dueOn}`,
        kind: 'price_increase',
        text: `${s.name} subió de ${formatArs(before.amountCents)} a ${formatArs(last.amountCents)}.`,
        to: '/recurrentes',
        at: `${last.dueOn}T00:00:00Z`,
        source: 'derived',
      })
    }
  }

  const month = today.slice(0, 7)
  for (const b of budgets) {
    if (!show.budgets || b.state === 'ok') continue
    items.push({
      key: `budget:${b.categoryId}:${month}:${b.state}`,
      kind: 'budget',
      text:
        b.state === 'over'
          ? `Superaste el límite de ${b.name} de este mes.`
          : `Estás cerca del límite de ${b.name} de este mes (${Math.round(b.percent)} %).`,
      to: '/categorias',
      at: `${today}T00:00:00Z`,
      source: 'derived',
    })
  }

  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** Unread = notices not read in the database + derived events not marked as read on this device. */
export function unreadCount(items: readonly CenterItem[], readKeys: ReadonlySet<string>): number {
  return items.filter((i) => (i.source === 'notice' ? !i.readInDb : !readKeys.has(i.key))).length
}
