import { Bell, Check, ChevronRight, Copy, Gift, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { formatArs } from '@/shared/lib/money'
import { copyText } from '@/shared/lib/share'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Avatar, Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useToast } from '@/shared/ui/toastContext'
import {
  markAllRead,
  markPaid,
  useNotifications,
  type PaymentNotice,
} from '../mock/notificationsStore'
import { RecurringReminders } from '@/features/recurring/ui/RecurringReminders'
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

  return (
    <Page>
      <PageHeader title="Avisos" backTo="/" />
      <SegmentedControl
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
          <RecurringReminders />
          <SectionLabel
            action={
              <Link to="/deudas" className="text-[14px] font-extrabold uppercase tracking-[0.1em]">
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
            <div key={p.id} className="rounded-[24px] border border-sand bg-white p-4">
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
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
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
                className="text-[14px] font-extrabold uppercase tracking-[0.1em]"
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
              className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-4"
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

          <SectionLabel>De Moni</SectionLabel>
          <Link
            to="/aguinaldo"
            className="flex items-center gap-3 rounded-[24px] border border-lime/60 bg-lime/25 p-4"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-white">
              <Gift aria-hidden="true" className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block text-[18px] font-extrabold">Se viene el aguinaldo</span>
              <span className="block text-[15px] text-text-muted">Cargalo y elegí a dónde va</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
          <Link
            to="/hormigas"
            className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-4"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-gold/40">
              <ShoppingBag aria-hidden="true" className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block text-[18px] font-extrabold">
                Tus gastos hormiga de la semana
              </span>
              <span className="block text-[15px] text-text-muted">
                Subieron un 7% contra la anterior
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        </>
      ) : (
        <>
          <p className="text-[16px] leading-6">
            Todos pueden editar los grupos. Moni te avisa cuando alguien cambia algo.
          </p>
          <ul className="flex flex-col gap-3">
            {data.activity.map((a) => (
              <li key={a.id} className="rounded-[24px] border border-sand bg-white p-4">
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
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
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
    </Page>
  )
}
