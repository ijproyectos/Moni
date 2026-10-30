import {
  Banknote,
  CalendarDays,
  Check,
  CreditCard,
  House,
  Plus,
  RefreshCw,
  Send,
  Target,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useGoalNames } from '@/features/goals/api/useSavings'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { formatDayMonth } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import {
  ChoiceChip,
  DashedButton,
  IconTile,
  MoniCalcCard,
  MoniGlyph,
  OptionRow,
  Page,
  Panel,
  SectionLabel,
  Toggle,
} from '@/shared/ui/kit'
import { themedColor } from '@/shared/ui/categoryIcons'
import { PageHeader } from '@/shared/ui/PageHeader'
import {
  addDestination,
  setDestinationAmount,
  updateAguinaldo,
  useAguinaldo,
  type Destination,
  type DestinationKind,
} from '../mock/aguinaldoStore'

const DEFAULT_PAY_DATE = '2026-12-18'

// Screen 070 — Tu aguinaldo.
export function AguinaldoPage() {
  const navigate = useNavigate()
  const plan = useAguinaldo()
  const [text, setText] = useState(formatAmountInput(plan.amountCents))
  const [picking, setPicking] = useState(false)
  const amount = parseAmountInput(text) ?? 0
  const isDefaultDate = plan.payDate === DEFAULT_PAY_DATE

  if (picking) {
    return (
      <DatePickerSheet
        title="¿Cuándo lo cobrás?"
        value={plan.payDate}
        min={todayIso()}
        onClose={() => setPicking(false)}
        onConfirm={(payDate) => {
          updateAguinaldo({ payDate })
          setPicking(false)
        }}
      />
    )
  }

  return (
    <Page className="pb-28">
      <PageHeader title="Tu aguinaldo" />
      <MoniCalcCard
        label="Moni te acompaña"
        mascot={mascotUrl}
        title="Contale cuánto cobrás y elegí a dónde va"
        className="flex-row-reverse"
      />
      <SectionLabel>¿Cuánto cobrás de aguinaldo?</SectionLabel>
      <AmountInput
        aria-label="Monto del aguinaldo"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-[15px] leading-5 text-text-muted">
        Suele ser la mitad del mejor sueldo del semestre. Poné una estimación y la cambiás cuando
        cobres.
      </p>
      <SectionLabel>¿Cuándo lo cobrás?</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <ChoiceChip
          icon={CalendarDays}
          selected={isDefaultDate}
          onClick={() => updateAguinaldo({ payDate: DEFAULT_PAY_DATE })}
        >
          18 de dic
        </ChoiceChip>
        <ChoiceChip icon={CalendarDays} selected={!isDefaultDate} onClick={() => setPicking(true)}>
          {isDefaultDate ? 'Otra fecha' : formatDayMonth(plan.payDate)}
        </ChoiceChip>
      </div>
      <div className="flex items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3">
        <span className="flex-1">
          <span className="block text-[17px] font-extrabold">Avisarme cuando cobre</span>
          <span className="block text-[15px] text-text-muted">
            Moni te recuerda mover la plata a su destino
          </span>
        </span>
        <Toggle
          label="Avisarme cuando cobre"
          checked={plan.remind}
          onChange={(remind) => updateAguinaldo({ remind })}
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          disabled={amount <= 0}
          onClick={() => {
            updateAguinaldo({ amountCents: amount })
            navigate('/aguinaldo/reparto')
          }}
        >
          Elegir a dónde va
        </Button>
      </div>
    </Page>
  )
}

const KIND_ICONS: Record<DestinationKind, { icon: LucideIcon; bg: string; color: string }> = {
  goal: { icon: House, bg: '#e3f2cf', color: '#064735' },
  trip: { icon: Send, bg: '#fdeab8', color: '#c47f00' },
  card: { icon: CreditCard, bg: '#e7defa', color: '#6b4fb8' },
  account: { icon: WalletCards, bg: '#e3f2cf', color: '#2f7d1f' },
  installments: { icon: RefreshCw, bg: '#fdeab8', color: '#8a5a00' },
}

// Screens 071 / 072 — ¿A dónde va?
export function AguinaldoSplitPage() {
  const navigate = useNavigate()
  const plan = useAguinaldo()
  const goals = useGoalNames()
  const [adding, setAdding] = useState(false)
  const assigned = plan.destinations.reduce((s, d) => s + d.cents, 0)
  const left = plan.amountCents - assigned

  function detail(d: Destination) {
    const goal = d.goalId ? goals.find((g) => g.id === d.goalId) : undefined
    if (!goal) return d.detail
    const pct = (c: number) => `${Math.round((c / goal.targetCents) * 100)}%`
    return `Meta · pasa de ${pct(goal.savedCents)} a ${pct(Math.min(goal.targetCents, goal.savedCents + d.cents))}`
  }

  return (
    <Page className="pb-28">
      <PageHeader title="¿A dónde va?" />
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <div className="flex items-start justify-between">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
            Tu aguinaldo
          </p>
          <span className="rounded-full bg-lime px-3 py-0.5 text-[14px] font-extrabold text-forest">
            {left === 0
              ? 'Todo repartido'
              : left > 0
                ? `Faltan ${formatArs(left)}`
                : `Te pasaste ${formatArs(-left)}`}
          </span>
        </div>
        <p className="font-display text-[40px] font-extrabold">{formatArs(plan.amountCents)}</p>
        <div className="ml-auto mt-2 flex h-3 w-1/2 gap-1" aria-hidden="true">
          {plan.destinations.map((d) => (
            <span
              key={d.id}
              className="rounded-full"
              style={{ flexGrow: d.cents, backgroundColor: themedColor(d.color) }}
            />
          ))}
        </div>
      </section>
      <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
        {plan.destinations.map((d) => {
          const visual = KIND_ICONS[d.kind]
          return (
            <li key={d.id} className="flex items-center gap-2.5 py-3 pl-3 pr-3">
              <span
                aria-hidden="true"
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: themedColor(d.color) }}
              />
              <IconTile
                icon={d.kind === 'goal' && d.name.includes('emergencia') ? Banknote : visual.icon}
                bg={visual.bg}
                color={visual.color}
                className="size-11"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold leading-5">{d.name}</span>
                <span className="block text-[13px] leading-4 text-text-muted">{detail(d)}</span>
              </span>
              <label className="flex items-center rounded-[14px] border border-sand bg-canvas px-2 py-1.5 text-[17px] font-extrabold">
                $
                <input
                  aria-label={`Monto para ${d.name}`}
                  inputMode="decimal"
                  defaultValue={formatAmountInput(d.cents)}
                  onBlur={(e) => setDestinationAmount(d.id, parseAmountInput(e.target.value) ?? 0)}
                  className="w-[70px] bg-transparent text-right outline-none"
                />
              </label>
            </li>
          )
        })}
      </ul>
      <DashedButton onClick={() => setAdding(true)}>
        <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} /> Agregar otro destino
      </DashedButton>
      <Panel className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40">
          <MoniGlyph className="size-9" />
        </span>
        <p className="text-[16px] leading-6">
          <strong className="font-extrabold">Sugerido:</strong> ordenado por lo que vence antes: tu
          parte del viaje de marzo y la tarjeta. Cambiá cualquier monto.
        </p>
      </Panel>
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          disabled={left !== 0}
          onClick={() => {
            updateAguinaldo({ confirmed: true })
            navigate('/aguinaldo/listo', { replace: true })
          }}
        >
          <Check aria-hidden="true" className="mr-2 size-5" /> Confirmar reparto
        </Button>
      </div>
      {adding && (
        <BottomSheet title="¿A dónde más?" onClose={() => setAdding(false)}>
          <div className="flex flex-col gap-3">
            {(
              [
                ['goal', Target, 'Una meta', 'Sumarlo a una que ya tenés o crear una', '#e3f2cf'],
                ['trip', Send, 'Un viaje', 'Para tu parte o tu presupuesto', '#d9ebe4'],
                [
                  'card',
                  CreditCard,
                  'Una tarjeta o cuenta',
                  'Pagar el cierre o dejarlo guardado',
                  '#e7defa',
                ],
                ['installments', RefreshCw, 'Cuotas', 'Adelantar las que ya tenés', '#fdeab8'],
              ] as const
            ).map(([kind, icon, title, subtitle, bg]) => (
              <OptionRow
                key={kind}
                icon={<IconTile icon={icon} bg={bg} />}
                title={title}
                subtitle={subtitle}
                onClick={() => {
                  const unused = goals.find(
                    (g) => !g.shared && !plan.destinations.some((d) => d.goalId === g.id),
                  )
                  const presets: Record<string, Omit<Destination, 'id' | 'color'>> = {
                    goal: {
                      kind: 'goal',
                      goalId: unused?.id,
                      name: unused?.name ?? 'Nueva meta',
                      detail: 'Meta',
                      cents: 0,
                    },
                    trip: {
                      kind: 'trip',
                      name: 'Bariloche',
                      detail: 'Viaje · presupuesto',
                      cents: 0,
                    },
                    card: {
                      kind: 'account',
                      name: 'Efectivo',
                      detail: 'Cuenta · guardado para vos',
                      cents: 0,
                    },
                    installments: {
                      kind: 'installments',
                      name: 'Cuotas',
                      detail: 'Adelantar cuotas',
                      cents: 0,
                    },
                  }
                  const preset = presets[kind]
                  if (preset) addDestination(preset)
                  setAdding(false)
                }}
              />
            ))}
            <Button
              variant="ghost"
              onClick={() => setAdding(false)}
              className="h-14 rounded-full border-2 border-sand bg-card text-ink"
            >
              Cancelar
            </Button>
          </div>
        </BottomSheet>
      )}
    </Page>
  )
}

// Screen 073 — Aguinaldo listo.
export function AguinaldoDonePage() {
  const navigate = useNavigate()
  const plan = useAguinaldo()
  return (
    <Page className="pb-28 pt-12">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => navigate('/mas')}
        className="flex size-12 items-center justify-center rounded-full bg-sand"
      >
        <X aria-hidden="true" className="size-6" />
      </button>
      <div className="mx-auto flex size-40 items-center justify-center rounded-[32px] bg-cream">
        <img src={mascotUrl} alt="" className="size-36" />
      </div>
      <h1 className="text-center font-display text-[30px] font-extrabold leading-9">
        Tu aguinaldo ya tiene destino
      </h1>
      <p className="text-center text-[16px] leading-6 text-text-muted">
        Cuando cobres el {formatDayMonth(plan.payDate).replace(' ', ' de ')}, Moni te avisa y mueve
        cada monto donde elegiste.
      </p>
      <Panel>
        <ul className="flex flex-col gap-2.5">
          {plan.destinations.map((d) => (
            <li key={d.id} className="flex items-center gap-3 text-[16px]">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: themedColor(d.color) }}
              />
              <span className="flex-1">{d.name}</span>
              <strong className="font-extrabold">{formatArs(d.cents)}</strong>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-ink pt-3">
          <strong className="text-[17px] font-extrabold">Total</strong>
          <strong className="font-display text-[24px] font-extrabold">
            {formatArs(plan.amountCents)}
          </strong>
        </div>
      </Panel>
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button variant="dark" onClick={() => navigate('/mas')}>
          Listo
        </Button>
      </div>
    </Page>
  )
}
