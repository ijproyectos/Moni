import { Bell, Check, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { formatDayMonth } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { addDays, todayIso, type IsoDate } from '@/shared/lib/month'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import { Avatar, ChoiceChip, Page, SectionLabel, Toggle } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import {
  markPaid,
  markReceived,
  saveReminder,
  setWeeklyNudge,
  useNotifications,
  type PaymentNotice,
} from '../mock/notificationsStore'
import { RemindSheet } from './RemindSheet'

// Screens 067 / 068 / 069 — Deudas.
export function DebtsPage() {
  const data = useNotifications()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'te-deben' ? 'owed' : 'owe'
  const [reminding, setReminding] = useState<PaymentNotice | null>(null)
  const [scheduling, setScheduling] = useState<PaymentNotice | null>(null)
  const owe = data.toPay.reduce((s, p) => s + p.amountCents, 0)
  const owed = data.owedToMe.reduce((s, p) => s + p.amountCents, 0)
  const net = owed - owe

  return (
    <Page>
      <PageHeader title="Deudas" />
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Tu saldo en grupos
        </p>
        <p
          className={`font-display text-[44px] font-extrabold leading-[52px] ${net >= 0 ? 'text-lime' : 'text-blush'}`}
        >
          {formatArs(net, { signed: true })}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] bg-surface px-3 py-2">
            <p className="text-[14px] text-text-muted-on-dark">Debés</p>
            <p className="text-[19px] font-extrabold text-blush">{formatArs(owe)}</p>
          </div>
          <div className="rounded-[16px] bg-surface px-3 py-2">
            <p className="text-[14px] text-text-muted-on-dark">Te deben</p>
            <p className="text-[19px] font-extrabold text-lime">{formatArs(owed)}</p>
          </div>
        </div>
      </section>
      <SegmentedControl
        label="Deudas"
        value={tab}
        onChange={(t) => setParams(t === 'owed' ? { tab: 'te-deben' } : {}, { replace: true })}
        options={[
          { value: 'owe', label: 'Debés' },
          { value: 'owed', label: 'Te deben' },
        ]}
      />

      {tab === 'owe' ? (
        <>
          {data.toPay.length === 0 && (
            <p className="text-center text-[16px] text-text-muted">¡No le debés nada a nadie!</p>
          )}
          {data.toPay.map((p) => {
            const reminder = data.reminders.find((r) => r.noticeId === p.id)
            return (
              <div key={p.id} className="flex flex-col gap-3">
                <div className="rounded-[24px] border border-sand bg-white p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.person} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[19px] font-extrabold">
                        Le debés a {p.person}
                      </span>
                      <span className="block text-[15px] text-text-muted">{p.group} · octubre</span>
                    </span>
                    <span className="font-display text-[26px] font-extrabold text-expense">
                      {formatArs(p.amountCents)}
                    </span>
                  </div>
                  {p.items && (
                    <ul className="mt-2 divide-y divide-sand">
                      {p.items.map((it) => (
                        <li key={it.label} className="flex justify-between py-2 text-[16px]">
                          <span>{it.label}</span>
                          <strong className="font-extrabold">{formatArs(it.cents)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyText(p.alias, toast, 'Alias copiado')}
                    className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-[14px] bg-sand px-3 text-[16px] font-extrabold"
                  >
                    <Copy aria-hidden="true" className="size-4" />
                    <span className="flex-1 text-left">
                      Alias de {p.person} · {p.alias}
                    </span>
                    <span className="text-[15px]">Copiar</span>
                  </button>
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
                      onClick={() => setScheduling(p)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
                    >
                      <Bell aria-hidden="true" className="size-5" /> Recordarme
                    </button>
                  </div>
                </div>
                {reminder && (
                  <button
                    type="button"
                    onClick={() => setScheduling(p)}
                    className="flex items-center gap-3 rounded-[24px] bg-lime/30 p-4 text-left"
                  >
                    <span className="flex size-12 items-center justify-center rounded-full bg-white">
                      <Bell aria-hidden="true" className="size-6" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[18px] font-extrabold">
                        Recordatorio para vos
                      </span>
                      <span className="block text-[15px] leading-5 text-text-muted">
                        Pagale a {p.person} · te aviso el{' '}
                        {formatDayMonth(reminder.date).replace(' ', ' de ')}, {reminder.time}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                )}
              </div>
            )
          })}
        </>
      ) : (
        <>
          {data.owedToMe.map((p) => (
            <div key={p.id} className="rounded-[24px] border border-sand bg-white p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.person} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[19px] font-extrabold">{p.person} te debe</span>
                  <span className="block text-[15px] leading-5 text-text-muted">
                    {p.group} · {p.detail}
                  </span>
                </span>
                <span className="font-display text-[26px] font-extrabold text-income">
                  {formatArs(p.amountCents)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReminding(p)}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime text-[16px] font-extrabold"
                >
                  <Bell aria-hidden="true" className="size-5" /> Avisarle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markReceived(p.id)
                    toast.show(`Anotado: ${p.person} te pagó`)
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
                >
                  <Check aria-hidden="true" className="size-5" /> Ya me pagó
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-[22px] border border-sand bg-white px-4 py-3">
            <span className="flex-1">
              <span className="block text-[17px] font-extrabold">Recordarles cada semana</span>
              <span className="block text-[15px] text-text-muted">
                Moni les avisa sola hasta que paguen
              </span>
            </span>
            <Toggle
              label="Recordarles cada semana"
              checked={data.weeklyNudge}
              onChange={setWeeklyNudge}
            />
          </div>
        </>
      )}

      {reminding && (
        <RemindSheet notice={reminding} myAlias={data.myAlias} onClose={() => setReminding(null)} />
      )}
      {scheduling && (
        <ScheduleReminderSheet notice={scheduling} onClose={() => setScheduling(null)} />
      )}
    </Page>
  )
}

const TIMES = ['09:00', '10:00', '13:00', '18:00', '21:00']

// Screen 069 — Recordarme un pago.
function ScheduleReminderSheet({
  notice,
  onClose,
}: {
  notice: PaymentNotice
  onClose: () => void
}) {
  const toast = useToast()
  const today = todayIso()
  const options: { label: string; date: IsoDate }[] = [
    { label: 'Mañana', date: addDays(today, 1) },
    { label: 'En 3 días', date: addDays(today, 3) },
    {
      label: `El ${formatDayMonth(addDays(today, 8)).replace(' ', ' de ')}`,
      date: addDays(today, 8),
    },
  ]
  const [date, setDate] = useState(addDays(today, 8))
  const [time, setTime] = useState('10:00')
  const [picking, setPicking] = useState(false)
  const custom = !options.some((o) => o.date === date)
  const dueDay = Number(date.slice(8, 10)) + 1

  if (picking) {
    return (
      <DatePickerSheet
        title="¿Cuándo te aviso?"
        value={date}
        min={addDays(today, 1)}
        onClose={() => setPicking(false)}
        onConfirm={(d) => {
          setDate(d)
          setPicking(false)
        }}
      />
    )
  }

  return (
    <BottomSheet
      title="Recordarme"
      subtitle={`Pagale ${formatArs(notice.amountCents)} a ${notice.person}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Cuándo te aviso?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <ChoiceChip key={o.label} selected={date === o.date} onClick={() => setDate(o.date)}>
              {o.label}
            </ChoiceChip>
          ))}
          <ChoiceChip selected={custom} onClick={() => setPicking(true)}>
            {custom ? formatDayMonth(date) : 'Elegir fecha'}
          </ChoiceChip>
        </div>
        <button
          type="button"
          onClick={() => setTime(TIMES[(TIMES.indexOf(time) + 1) % TIMES.length] ?? time)}
          className="flex min-h-14 items-center justify-between rounded-[18px] border border-sand bg-white px-4"
        >
          <span className="text-[17px] font-extrabold">Hora</span>
          <span className="text-[22px] font-extrabold">{time}</span>
        </button>
        <div className="rounded-[22px] border border-sand bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-[14px] text-text-muted">
            <img src={mascotUrl} alt="" className="size-6 rounded-md bg-lime" />
            <strong className="font-extrabold text-forest">Moni</strong> ·{' '}
            {formatDayMonth(date).replace(' ', ' de ')}, {time}
          </p>
          <p className="mt-1 text-[18px] font-extrabold">
            Pagale a {notice.person} antes del {dueDay}
          </p>
          <p className="text-[15px]">
            {formatArs(notice.amountCents)} · Alias: {notice.alias}
          </p>
        </div>
        <Button
          onClick={() => {
            saveReminder({ noticeId: notice.id, date, time })
            toast.show('Recordatorio guardado')
            onClose()
          }}
        >
          Guardar recordatorio
        </Button>
      </div>
    </BottomSheet>
  )
}
