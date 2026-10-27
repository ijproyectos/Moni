import { CalendarDays, CreditCard, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { formatMonthShortYear, monthNameOf } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { addMonths } from '@/features/goals/domain/goals'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import {
  ChoiceChip,
  HeaderAddButton,
  IconTile,
  MoniGlyph,
  OptionRow,
  Page,
  Panel,
  ProgressBar,
  SectionLabel,
  Toggle,
} from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { addInstallmentPurchase, addSubscription, useRecurring } from '../mock/recurringStore'

const METHODS = ['Visa', 'Cuenta sueldo', 'Billetera']

function cycle<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length] ?? current
}

// Screens 074 / 075 / 076 / 077 — Fijos y cuotas.
export function RecurringPage() {
  const data = useRecurring()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cuotas' ? 'cuotas' : 'subs'
  const [sheet, setSheet] = useState<null | { kind: 'sub'; preset?: string } | { kind: 'cuota' }>(
    null,
  )

  const monthlySubs = data.subscriptions.reduce(
    (s, x) => s + (x.period === 'yearly' ? Math.round(x.monthlyCents / 12) : x.monthlyCents),
    0,
  )
  const monthlyCuotas = data.installments.reduce((s, x) => s + x.installmentCents, 0)
  const leftCuotas = data.installments.reduce(
    (s, x) => s + x.installmentCents * (x.total - x.paid),
    0,
  )
  const [first, second] = [...data.installments].sort((a, b) => a.endDate.localeCompare(b.endDate))

  return (
    <Page>
      <PageHeader
        title="Fijos y cuotas"
        backTo="/mas"
        action={
          <HeaderAddButton
            label={tab === 'subs' ? 'Nueva suscripción' : 'Nueva compra en cuotas'}
            onClick={() => setSheet(tab === 'subs' ? { kind: 'sub' } : { kind: 'cuota' })}
          />
        }
      />
      <SegmentedControl
        label="Tipo"
        value={tab}
        onChange={(t) => setParams(t === 'cuotas' ? { tab: 'cuotas' } : {}, { replace: true })}
        options={[
          { value: 'subs', label: 'Suscripciones' },
          { value: 'cuotas', label: 'Cuotas' },
        ]}
      />

      {tab === 'subs' ? (
        <>
          <section className="rounded-[28px] bg-forest p-5 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              Tenés
            </p>
            <p className="flex items-baseline gap-2 font-display font-extrabold">
              <span className="text-[44px] leading-[50px]">{data.subscriptions.length}</span>
              <span className="text-[22px]">suscripciones</span>
            </p>
            <p className="text-[16px] text-text-muted-on-dark">
              {formatArs(monthlySubs)} por mes · {formatArs(monthlySubs * 12)} al año
            </p>
          </section>
          {data.suggestion && (
            <div className="flex items-center gap-3 rounded-[22px] border-2 border-dashed border-[#d9c9a6] px-4 py-3">
              <p className="flex-1 text-[16px] leading-5">
                <strong className="font-extrabold">Moni encontró una más:</strong>{' '}
                {data.suggestion.name} ({formatArs(data.suggestion.monthlyCents)} el día{' '}
                {data.suggestion.billingDay})
              </p>
              <button
                type="button"
                onClick={() =>
                  data.suggestion && setSheet({ kind: 'sub', preset: data.suggestion.name })
                }
                className="min-h-11 rounded-full bg-forest px-4 text-[16px] font-extrabold text-cream"
              >
                Sumar
              </button>
            </div>
          )}
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {data.subscriptions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[20px] font-extrabold"
                  style={{ backgroundColor: s.tint, color: s.color }}
                >
                  {s.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-extrabold">{s.name}</span>
                  <span className="block text-[15px] leading-5 text-text-muted">
                    {s.kind} · cobra el {s.billingDay} · {s.method}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[18px] font-extrabold">
                    {formatArs(s.monthlyCents)}
                  </span>
                  <span className="block text-[14px] text-text-muted">
                    {s.period === 'yearly' ? 'por año' : 'por mes'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <section className="rounded-[28px] bg-forest p-5 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              Pagás en cuotas
            </p>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[44px] font-extrabold leading-[52px]">
                {formatArs(monthlyCuotas)}
              </span>
              <span className="text-[17px] text-text-muted-on-dark">por mes</span>
            </p>
            <p className="text-[16px] text-text-muted-on-dark">
              En total te quedan {formatArs(leftCuotas)} por pagar
            </p>
          </section>
          {data.installments.map((c) => (
            <Panel key={c.id}>
              <div className="flex items-center gap-3">
                <IconTile icon={ShoppingBag} bg={c.tint} color={c.color} />
                <span className="flex-1">
                  <span className="block text-[19px] font-extrabold">{c.name}</span>
                  <span className="block text-[15px] text-text-muted">
                    {c.method} · termina en {formatMonthShortYear(c.endDate).replace(' de ', ' ')}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[19px] font-extrabold">
                    {formatArs(c.installmentCents)}
                  </span>
                  <span className="block text-[14px] text-text-muted">por mes</span>
                </span>
              </div>
              <ProgressBar value={c.paid / c.total} className="mt-3" />
              <div className="mt-2 flex justify-between text-[15px] font-extrabold">
                <span>
                  Cuota {c.paid} de {c.total}
                </span>
                <span>Faltan {formatArs(c.installmentCents * (c.total - c.paid))}</span>
              </div>
            </Panel>
          ))}
          {first && second && (
            <Panel className="flex items-start gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40">
                <MoniGlyph className="size-9" />
              </span>
              <p className="text-[16px] leading-6">
                <strong className="font-extrabold">Moni dice:</strong> en{' '}
                {monthNameOf(first.endDate)} dejás de pagar {first.name.toLowerCase()} y liberás{' '}
                {formatArs(first.installmentCents)} por mes. En {monthNameOf(second.endDate)},{' '}
                {formatArs(second.installmentCents)} más.
              </p>
            </Panel>
          )}
          <OptionRow
            to="/metas/cuotas"
            icon={<IconTile icon={CreditCard} bg="#fdeab8" />}
            title="¿Vas a comprar algo en cuotas?"
            subtitle="Compará si te conviene"
          />
        </>
      )}

      {sheet?.kind === 'sub' && (
        <NewSubscriptionSheet preset={sheet.preset} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'cuota' && (
        <NewInstallmentSheet monthlyNow={monthlyCuotas} onClose={() => setSheet(null)} />
      )}
    </Page>
  )
}

const BRANDS: Record<string, { kind: string; cents: number }> = {
  Netflix: { kind: 'Streaming', cents: 8_000_00 },
  Spotify: { kind: 'Música', cents: 6_500_00 },
  Prime: { kind: 'Compras y video', cents: 9_900_00 },
  YouTube: { kind: 'Video', cents: 7_800_00 },
  'Disney+': { kind: 'Streaming', cents: 6_900_00 },
}

// Screen 075 — Nueva suscripción.
function NewSubscriptionSheet({ preset, onClose }: { preset?: string; onClose: () => void }) {
  const toast = useToast()
  const [brand, setBrand] = useState(preset ?? 'Disney+')
  const [otherName, setOtherName] = useState('')
  const [text, setText] = useState(formatAmountInput(BRANDS[preset ?? 'Disney+']?.cents ?? 0))
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [day, setDay] = useState(11)
  const [method, setMethod] = useState('Visa')
  const [remind, setRemind] = useState(true)
  const amount = parseAmountInput(text) ?? 0
  const name = brand === 'Otra' ? otherName.trim() : brand

  return (
    <BottomSheet title="Nueva suscripción" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Cuál es?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[...Object.keys(BRANDS), 'Otra'].map((b) => (
            <ChoiceChip
              key={b}
              selected={brand === b}
              onClick={() => {
                setBrand(b)
                const brandInfo = BRANDS[b]
                if (brandInfo) setText(formatAmountInput(brandInfo.cents))
              }}
            >
              {b}
            </ChoiceChip>
          ))}
        </div>
        {brand === 'Otra' && (
          <input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre de la suscripción"
            className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px]"
          />
        )}
        <div className="flex items-end gap-2">
          <AmountInput
            aria-label="Monto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />
          <span className="pb-3 text-[15px] text-text-muted">
            {period === 'monthly' ? 'por mes' : 'por año'}
          </span>
        </div>
        <SegmentedControl
          label="Frecuencia"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'yearly', label: 'Anual' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDay((d) => (d % 28) + 1)}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-white px-4 text-[17px] font-extrabold"
          >
            <CalendarDays aria-hidden="true" className="size-5" /> Cobra el {day}
          </button>
          <button
            type="button"
            onClick={() => setMethod((m) => cycle(METHODS, m))}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-white px-4 text-[17px] font-extrabold"
          >
            <CreditCard aria-hidden="true" className="size-5" /> {method}
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-[18px] border border-sand bg-white px-4 py-3">
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Avisarme antes del cobro</span>
            <span className="block text-[14px] text-text-muted">Un día antes</span>
          </span>
          <Toggle label="Avisarme antes del cobro" checked={remind} onChange={setRemind} />
        </div>
        <Button
          disabled={!name || amount <= 0}
          onClick={() => {
            addSubscription({
              name,
              kind: BRANDS[brand]?.kind ?? 'Suscripción',
              monthlyCents: amount,
              billingDay: day,
              method,
              period,
              remind,
            })
            toast.show(`${name} agregada`)
            onClose()
          }}
        >
          Guardar
        </Button>
      </div>
    </BottomSheet>
  )
}

// Screen 077 — Compra en cuotas.
function NewInstallmentSheet({ monthlyNow, onClose }: { monthlyNow: number; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [count, setCount] = useState(12)
  const [paid, setPaid] = useState(1)
  const [method, setMethod] = useState('Visa')
  const total = parseAmountInput(text) ?? 0
  const per = count > 0 ? Math.round(total / count) : 0
  const end = addMonths(todayIso(), count - paid + 1)

  return (
    <BottomSheet title="Compra en cuotas" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Qué compraste?</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Heladera"
          aria-label="Qué compraste"
          className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px]"
        />
        <SectionLabel>Total de la compra</SectionLabel>
        <AmountInput
          aria-label="Total de la compra"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <SectionLabel>¿En cuántas cuotas?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[3, 6, 9, 12, 18].map((c) => (
            <ChoiceChip
              key={c}
              selected={c === count}
              onClick={() => setCount(c)}
              className="size-12 px-0"
            >
              {c}
            </ChoiceChip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaid((p) => (p % count) + 1)}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-white px-4 text-[17px] font-extrabold"
          >
            <CalendarDays aria-hidden="true" className="size-5" /> Voy en la {paid}
          </button>
          <button
            type="button"
            onClick={() => setMethod((m) => cycle(METHODS, m))}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-white px-4 text-[17px] font-extrabold"
          >
            <CreditCard aria-hidden="true" className="size-5" /> {method}
          </button>
        </div>
        {per > 0 && (
          <div className="rounded-[22px] bg-forest p-4 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-lime">
              Moni calcula
            </p>
            <p className="font-display text-[24px] font-extrabold">{formatArs(per)} por mes</p>
            <p className="text-[15px] leading-5 text-text-muted-on-dark">
              Terminás de pagar en {formatMonthShortYear(end).replace(' de ', ' ')}. Tus cuotas
              pasan a {formatArs(monthlyNow + per)} por mes.
            </p>
          </div>
        )}
        <Button
          disabled={!name.trim() || per <= 0}
          onClick={() => {
            addInstallmentPurchase({
              name: name.trim(),
              method,
              installmentCents: per,
              total: count,
              paid: paid - 1,
              endDate: end,
            })
            toast.show('Compra en cuotas guardada')
            onClose()
          }}
        >
          Guardar
        </Button>
      </div>
    </BottomSheet>
  )
}
