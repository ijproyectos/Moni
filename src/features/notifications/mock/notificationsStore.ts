// Simulated notifications (Avisos). In-memory only.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'

export interface PaymentNotice {
  id: string
  person: string
  amountCents: Cents
  group: string
  detail: string
  alias: string
  /** Breakdown of what the debt is made of. */
  items?: { label: string; cents: Cents }[]
}

export interface PaymentReminder {
  noticeId: string
  date: string
  time: string
}

export interface GroupActivity {
  id: string
  person: string
  title: string
  body: string
  when: string
  action: { label: string; to: string; icon?: 'gift' } | null
  primary?: { label: string; to: string }
}

export interface NotificationsState {
  toPay: PaymentNotice[]
  owedToMe: PaymentNotice[]
  activity: GroupActivity[]
  unread: number
  myAlias: string
  reminders: PaymentReminder[]
  weeklyNudge: boolean
}

// Seeds are empty on purpose: nothing here was entered by the person (see docs/FEATURE_FLAGS.md).
const store = createMockStore<NotificationsState>({
  unread: 0,
  myAlias: '',
  weeklyNudge: false,
  reminders: [],
  toPay: [],
  owedToMe: [],
  activity: [],
})

export function useNotifications(): NotificationsState {
  return useMockStore(store)
}

export function markAllRead() {
  store.set((s) => (s.unread === 0 ? s : { ...s, unread: 0 }))
}

export function markPaid(id: string) {
  store.set((s) => ({ ...s, toPay: s.toPay.filter((p) => p.id !== id) }))
}

export function markReceived(id: string) {
  store.set((s) => ({ ...s, owedToMe: s.owedToMe.filter((p) => p.id !== id) }))
}

export function saveReminder(reminder: PaymentReminder) {
  store.set((s) => ({
    ...s,
    reminders: [...s.reminders.filter((r) => r.noticeId !== reminder.noticeId), reminder],
  }))
}

export function setWeeklyNudge(weeklyNudge: boolean) {
  store.set((s) => ({ ...s, weeklyNudge }))
}
