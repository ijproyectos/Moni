import { Bell, BellRing, Check, Copy, Gift, PieChart, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useBudgetStatus } from '@/features/budgets/api/useBudgets'
import { budgetAlerts } from '@/features/budgets/domain/budget'
import { useRecurringReminders } from '@/features/recurring/api/useRecurringReminders'
import { monthStart, todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { groupNotices, type NoticeItem, type NoticeTone } from '../domain/notificationFeed'
import { formatArs } from '@/shared/lib/money'
import { copyText } from '@/shared/lib/share'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Avatar, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  markAllRead,
  markPaid,
  useNotifications,
  type PaymentNotice,
} from '../mock/notificationsStore'
import { SavingsNotices } from '@/features/goals/ui/SavingsNotices'
import { RemindSheet } from './RemindSheet'

// Screens 021 / 022 / 128 — Avisos.
export function NotificationsPage() {
  const data = useNotifications()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'grupos' ? 'grupos' : 'pagos'
  const [reminding, setReminding] = useState<PaymentNotice | null>(null)

  useEffect(() => markAllRead(), [])
  const today = todayIso()
  const reminders = useRecurringReminders()
  const budgets = useBudgetStatus(monthStart(today))
  const notices: NoticeItem[] = [
    ...reminders.map((r): NoticeItem => ({ key: r.key, tone: 'gold', title: r.text, day: today, to: r.to })),
    ...budgetAlerts(budgets.data ?? []).map(
      (b): NoticeItem => ({
        key: `budget-${b.budgetId}`,
        tone: b.state === 'over' ? 'red' : 'gold',
        title: b.state === 'over' ? `Te pasaste en ${b.name}` : `${b.name} va por el ${Math.floor(b.percent)}%`,
        detail: b.state === 'over' ? 'Superaste el límite del mes' : 'Está cerca del límite del mes',
        day: today,
        to: '/presupuesto',
      }),
    ),
  ]
  const groups = groupNotices(notices, today)

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader
        title="Notificaciones"
        subtitle={notices.length === 0 ? 'Todo al día' : `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}`}
        backTo="/"
      />
      <SegmentedControl
        variant="menta"
        label="Tipo de aviso"
        value={tab}
        onChange={(t) => setParams(t === 'grupos' ? { tab: 'grupos' } : {}, { replace: true })}
        options={[
          { value: 'pagos', label: 'Pagos' },
          { value: 'grupos', label: 'Grupos' },
        ]}
      />

      {tab === 'pagos' ? (
        <>
          <SavingsNotices />
          <NoticeSection title="Hoy" items={groups.today} />
          <NoticeSection title="Esta semana" items={groups.thisWeek} />
          {notices.length === 0 && (
            <p className="rounded-[26px] bg-card px-4 py-5 text-center text-[14.5px] text-text-muted">
              No tenés avisos por ahora. Cuando haya un vencimiento o un límite cerca, lo ves acá.
            </p>
          )}
          <SectionLabel
            action={
              <Link
                to="/deudas"
                className="inline-flex min-h-11 items-center text-[14px] font-extrabold uppercase tracking-[0.1em]"
              >
                Ver todo
              </Link>
            }
          >
            Para pagar
          </SectionLabel>
          {data.toPay.length === 0 && (
            <p className="text-[15px] text-text-muted">No tenés pagos pendientes.</p>
          )}
          {data.toPay.map((p) => (
            <div key={p.id} className="rounded-[24px] border border-line bg-card p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.person} />
                <span>
                  <span className="block text-[19px] font-extrabold">
                    Le debés {formatArs(p.amountCents)} a {p.person}
                  </span>
                  <span className="block text-[15px] text-text-muted">
                    {p.group} · {p.detail}
                  </span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    markPaid(p.id)
                    toast.show(`Listo, le pagaste a ${p.person}`)
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime text-[16px] font-extrabold"
                >
                  <Check aria-hidden="true" className="size-5" /> Ya pagué
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(p.alias, toast, 'Alias copiado')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line bg-card text-[16px] font-extrabold"
                >
                  <Copy aria-hidden="true" className="size-5" /> Copiar alias
                </button>
              </div>
            </div>
          ))}

          <SectionLabel
            action={
              <Link
                to="/deudas?tab=te-deben"
                className="inline-flex min-h-11 items-center text-[14px] font-extrabold uppercase tracking-[0.1em]"
              >
                Ver todo
              </Link>
            }
          >
            Te deben
          </SectionLabel>
          {data.owedToMe.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-[24px] border border-line bg-card p-4"
            >
              <Avatar name={p.person} />
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-extrabold leading-6">
                  {p.person} te debe {formatArs(p.amountCents)}
                </span>
                <span className="block text-[15px] leading-5 text-text-muted">
                  {p.group} · {p.detail}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setReminding(p)}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-forest px-3.5 text-[16px] font-extrabold text-cream"
              >
                <Bell aria-hidden="true" className="size-4" /> Avisar
              </button>
            </div>
          ))}

        </>
      ) : (
        <>
          <p className="text-[16px] leading-6">
            Todos pueden editar los grupos. Moni te avisa cuando alguien cambia algo.
          </p>
          <ul className="flex flex-col gap-3">
            {data.activity.map((a) => (
              <li key={a.id} className="rounded-[24px] border border-line bg-card p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={a.person} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[17px] font-extrabold leading-6">{a.title}</p>
                      <span className="shrink-0 text-[14px] text-text-muted">{a.when}</span>
                    </div>
                    <p className="text-[15px] leading-5 text-text-muted">{a.body}</p>
                  </div>
                </div>
                {(a.primary || a.action) && (
                  <div className={a.primary ? 'mt-3 grid grid-cols-2 gap-2' : 'mt-3'}>
                    {a.primary && (
                      <button
                        type="button"
                        onClick={() => a.primary && navigate(a.primary.to)}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime text-[16px] font-extrabold"
                      >
                        <Check aria-hidden="true" className="size-5" /> {a.primary.label}
                      </button>
                    )}
                    {a.action && (
                      <button
                        type="button"
                        onClick={() => a.action && navigate(a.action.to)}
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-line bg-card text-[16px] font-extrabold"
                      >
                        {a.action.icon === 'gift' && <Gift aria-hidden="true" className="size-5" />}
                        {a.action.label}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {reminding && (
        <RemindSheet notice={reminding} myAlias={data.myAlias} onClose={() => setReminding(null)} />
      )}
    </section>
  )
}

const TONES: Record<NoticeTone, { icon: LucideIcon; className: string }> = {
  gold: { icon: BellRing, className: 'bg-warn-bg text-warn-ink' },
  red: { icon: PieChart, className: 'bg-bad-bg text-bad-ink' },
  green: { icon: Bell, className: 'bg-ok-bg text-ok-ink' },
}

/** One group of the feed ("Hoy", "Esta semana"): a tinted icon, the notice and where it leads. Empty groups do not show. */
function NoticeSection({ title, items }: { title: string; items: readonly NoticeItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <Kicker as="h2">{title}</Kicker>
      <ul className="rounded-[26px] bg-card px-4 py-0.5">
        {items.map((n) => {
          const { icon: Icon, className } = TONES[n.tone]
          return (
            <li key={n.key} className="border-b border-line last:border-b-0">
              <Link
                to={n.to}
                className={cn('grid grid-cols-[40px_1fr] items-start gap-3 py-[11px]', FOCUS_RING)}
              >
                <span
                  aria-hidden="true"
                  className={cn('flex size-10 items-center justify-center rounded-full', className)}
                >
                  <Icon className="size-[18px]" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium leading-[1.3]">{n.title}</span>
                  {n.detail && <span className="block text-[12.5px] text-text-muted">{n.detail}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
