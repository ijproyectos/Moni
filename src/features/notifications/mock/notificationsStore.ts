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

const store = createMockStore<NotificationsState>({
  unread: 3,
  myAlias: 'tunombre.mp',
  weeklyNudge: true,
  reminders: [{ noticeId: 'p1', date: '2026-11-04', time: '10:00' }],
  toPay: [
    {
      id: 'p1',
      person: 'Lu',
      amountCents: 12_800_00,
      group: 'Depto Palermo',
      detail: 'internet y luz',
      alias: 'lu.pagos',
      items: [
        { label: 'Internet', cents: 8_000_00 },
        { label: 'Luz', cents: 4_800_00 },
      ],
    },
  ],
  owedToMe: [
    {
      id: 'o1',
      person: 'Lu',
      amountCents: 18_000_00,
      group: 'Asado del viernes',
      detail: 'hace 3 días',
      alias: 'lu.pagos',
    },
    {
      id: 'o2',
      person: 'Caro',
      amountCents: 18_000_00,
      group: 'Nosotros',
      detail: 'saldo del mes',
      alias: 'caro.mp',
    },
  ],
  activity: [
    {
      id: 'a1',
      person: 'Lu',
      title: 'Lu salió de “Depto Palermo”',
      body: 'Sus gastos quedan en las cuentas: le debés $12.800.',
      when: 'Hace 2 h',
      primary: { label: 'Saldar', to: '/deudas' },
      action: { label: 'Ver grupo', to: '/grupos' },
    },
    {
      id: 'a2',
      person: 'Mati',
      title: 'Mati editó “Bebidas”',
      body: 'Pasó de $27.000 a $28.000 y sumó a Fran. Las cuentas se recalcularon.',
      when: 'Ayer',
      action: { label: 'Ver gasto', to: '/grupos' },
    },
    {
      id: 'a3',
      person: 'Fran',
      title: 'Fran entró a “Asado del viernes”',
      body: 'Se bajó Moni con tu link: ganaron 2 meses de Pro.',
      when: 'Ayer',
      action: { label: 'Ver el premio', to: '/recomendar', icon: 'gift' },
    },
    {
      id: 'a4',
      person: 'Caro',
      title: 'Caro eliminó “Delivery”',
      body: 'Salen $11.000 de los gastos de pareja y tu saldo con Caro cambió.',
      when: 'Hace 3 días',
      action: { label: 'Ver pareja', to: '/grupos' },
    },
    {
      id: 'a5',
      person: 'Lu',
      title: 'Lu eliminó el grupo “Cumple de Caro”',
      body: 'Los gastos del grupo ya no cuentan en tus saldos.',
      when: 'Hace 1 semana',
      action: null,
    },
  ],
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
