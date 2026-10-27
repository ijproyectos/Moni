import { CalendarDays, Check, CreditCard, Heart, House, Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatCompactDate, formatLongDate, formatShortDate } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import {
  Avatar,
  ChoiceChip,
  IconTile,
  MoniCalcCard,
  MoniSays,
  OptionRow,
  SectionLabel,
  Toggle,
} from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  addMonths,
  monthsUntil,
  roundUpSuggestion,
  splitMonthly,
  type SplitMode,
} from '../domain/goals'
import { addGoal, MOCK_AGUINALDO_ESTIMATE, MOCK_PARTNER, newInviteCode } from '../mock/goalsStore'
import { useProfileExtras } from '@/features/settings/mock/profileExtrasStore'
import { GoalInviteSheet } from './GoalInviteSheet'
import { SplitPanel } from './SplitPanel'

export interface NewGoalPrefill {
  name: string
  amountCents: number
  months: number
  /** Extra installments cost avoided, shown when the plan comes from "¿Conviene en cuotas?". */
  comparedSavingCents?: number
  comparedCount?: number
}

type Horizon = 3 | 6 | 12 | 'date'
type SubSheet = null | 'date' | 'shareWith' | 'invite'

const INCOME_SHARE = 0.6

// Screens 025 / 026 / 027 / 136 / 138 / 139 / 141 / 143 / 144 / 145 / 146 — Nueva meta.
export function NewGoalSheet({
  onClose,
  prefill,
}: {
  onClose: () => void
  prefill?: NewGoalPrefill
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayIso()
  const [name, setName] = useState(prefill?.name ?? '')
  const [amountText, setAmountText] = useState(
    prefill ? String(prefill.amountCents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '',
  )
  const [horizon, setHorizon] = useState<Horizon>(
    prefill && [3, 6, 12].includes(prefill.months) ? (prefill.months as 3 | 6 | 12) : 6,
  )
  const [date, setDate] = useState<IsoDate>(addMonths(today, 4))
  const [shared, setShared] = useState(false)
  const [partner, setPartner] = useState<string | null>(null)
  const [split, setSplit] = useState<SplitMode>('income')
  const [sub, setSub] = useState<SubSheet>(null)
  const [code] = useState(() => newInviteCode(name || 'Meta'))
  const [error, setError] = useState<string | null>(null)

  const compared = Boolean(prefill?.comparedSavingCents)
  const amount = parseAmountInput(amountText) ?? 0
  const due = horizon === 'date' ? date : addMonths(today, horizon)
  const months = horizon === 'date' ? monthsUntil(today, date) : horizon
  const aguinaldo = compared ? MOCK_AGUINALDO_ESTIMATE : 0
  const monthly = roundUpSuggestion(Math.max(0, amount - aguinaldo) / months)
  const sharedActive = shared && partner !== null
  const partnerName = partner ?? MOCK_PARTNER
  const [mine, theirs] = splitMonthly(monthly, split, INCOME_SHARE)
  const income = useProfileExtras().monthlyIncomeCents
  const incomePct = income > 0 ? Math.floor((monthly / income) * 100) : 0

  function create() {
    if (!name.trim()) return setError('Ponele un nombre a la meta.')
    if (amount <= 0) return setError('Decinos cuánto necesitás.')
    addGoal({
      name: name.trim(),
      targetCents: amount,
      dueDate: due,
      icon: sharedActive ? 'heart' : 'target',
      shared: sharedActive
        ? {
            space: partner === MOCK_PARTNER ? 'Nosotros' : 'Depto Palermo',
            partner: partnerName,
            split,
            incomeShare: INCOME_SHARE,
            mineCents: 0,
            theirsCents: 0,
            monthMineCents: 0,
            monthTheirsCents: 0,
            inviteCode: code,
            pending: true,
          }
        : undefined,
    })
    toast.show('Meta creada')
    onClose()
  }

  if (sub === 'date') {
    return (
      <DatePickerSheet
        value={date}
        min={addMonths(today, 1)}
        onClose={() => setSub(null)}
        onConfirm={(d) => {
          setDate(d)
          setHorizon('date')
          setSub(null)
        }}
        hint={(d) => {
          const m = monthsUntil(today, d)
          const per = roundUpSuggestion(Math.max(0, amount - aguinaldo) / m)
          const [a, b] = splitMonthly(per, split, INCOME_SHARE)
          return (
            <MoniSays lead={`${formatLongDate(d)}:`}>
              {sharedActive
                ? `ahorran ${formatArs(per)} por mes entre los dos (Vos ${formatArs(a)} · ${partner} ${formatArs(b)}).`
                : `ahorrás ${formatArs(per)} por mes durante ${m} ${m === 1 ? 'mes' : 'meses'}.`}
            </MoniSays>
          )
        }}
      />
    )
  }
  if (sub === 'shareWith') {
    return (
      <BottomSheet title="Meta compartida" onClose={() => setSub(null)}>
        <p className="text-[16px] leading-6">
          ¿Con quién la compartís? Los dos ven el avance y aportan desde su app.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <OptionRow
            icon={<IconTile icon={Heart} bg="#fbdcd7" color="#b8321f" />}
            title="Con mi pareja"
            subtitle="Cada uno aporta y ve cuánto lleva"
            onClick={() => {
              setPartner(MOCK_PARTNER)
              setSub('invite')
            }}
          />
          <OptionRow
            icon={<IconTile icon={House} bg="#d9ebe4" />}
            title="Con mi familia o casa"
            subtitle="Depto, familia o quien comparta gastos"
            onClick={() => {
              setPartner(null)
              setSub('invite')
            }}
          />
        </div>
        <MoniSays className="mt-4" lead={null} icon={<span aria-hidden="true">✦</span>}>
          Al activarla, en Metas aparece la pestaña “Compartidas”. Si no la usás, ves solo las
          tuyas.
        </MoniSays>
      </BottomSheet>
    )
  }
  if (sub === 'invite') {
    return (
      <GoalInviteSheet
        partner={partner}
        code={code}
        moment="before"
        onClose={() => setSub(null)}
        onDone={() => {
          setShared(true)
          if (partner === null) setPartner('Fran')
          setSub(null)
        }}
      />
    )
  }

  return (
    <BottomSheet title="Nueva meta" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Notebook nueva"
          aria-label="Nombre"
          maxLength={40}
          className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted"
        />
        <SectionLabel className="mt-1">¿Cuánto necesitás?</SectionLabel>
        <AmountInput
          aria-label="Monto"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <SectionLabel className="mt-1">¿Para cuándo?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {([3, 6, 12] as const).map((m) => (
            <ChoiceChip key={m} selected={horizon === m} onClick={() => setHorizon(m)}>
              {m === 12 ? '1 año' : `${m} meses`}
            </ChoiceChip>
          ))}
          <ChoiceChip
            icon={CalendarDays}
            selected={horizon === 'date'}
            onClick={() => setSub('date')}
          >
            {horizon === 'date' ? formatCompactDate(date) : 'Elegir fecha'}
          </ChoiceChip>
        </div>

        {sharedActive ? (
          <MoniCalcCard title={`${formatArs(monthly)} por mes`}>
            entre los dos
            <span className="mt-0.5 block font-extrabold text-lime">
              Vos {formatArs(mine)} · {partner} {formatArs(theirs)}
            </span>
          </MoniCalcCard>
        ) : (
          <MoniCalcCard title={`Ahorrá ${formatArs(monthly)}`}>
            por mes, durante {months} {months === 1 ? 'mes' : 'meses'}
            {compared && (
              <span className="block font-extrabold text-lime">
                + aguinaldo de dic {formatArs(MOCK_AGUINALDO_ESTIMATE)}
              </span>
            )}
          </MoniCalcCard>
        )}

        {!sharedActive && (
          <p className="text-[15px] leading-5 text-text-muted">
            {compared
              ? `Lo comprás sin pagar interés. En ${prefill?.comparedCount ?? 12} cuotas pagarías ${formatArs(prefill?.comparedSavingCents ?? 0)} más.`
              : `Es el ${incomePct}% de lo que ingresás y llegás el ${formatShortDate(due)}. Cambiá el plazo y Moni recalcula.`}
          </p>
        )}

        {!sharedActive &&
          (compared ? (
            <div className="flex items-center gap-3 rounded-[22px] border-2 border-forest bg-white px-4 py-3">
              <IconTile icon={CreditCard} bg="#fdeab8" />
              <span className="flex-1">
                <span className="block text-[17px] font-extrabold">Comparado con cuotas</span>
                <span className="block text-[15px] text-text-muted">
                  Con el aguinaldo ahorrás {formatArs(prefill?.comparedSavingCents ?? 0)}
                </span>
              </span>
              <span className="flex size-7 items-center justify-center rounded-full bg-forest text-lime">
                <Check aria-hidden="true" className="size-4" strokeWidth={3} />
              </span>
            </div>
          ) : (
            <OptionRow
              icon={<IconTile icon={CreditCard} bg="#fdeab8" />}
              title="¿Lo vas a pagar en cuotas?"
              subtitle="Compará y Moni te dice si conviene"
              onClick={() =>
                navigate('/metas/cuotas', {
                  state: {
                    name: name.trim() || 'Notebook nueva',
                    amountCents: amount || 900_000_00,
                  },
                })
              }
            />
          ))}

        <div
          className={cn(
            'flex items-center gap-3 rounded-[22px] border bg-white px-4 py-3',
            shared ? 'border-2 border-forest' : 'border-sand',
          )}
        >
          <IconTile icon={UsersRound} bg="#d9ebe4" />
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Meta compartida</span>
            <span className="block text-[15px] text-text-muted">Con tu pareja o familia</span>
          </span>
          <Toggle
            label="Meta compartida"
            checked={shared}
            onChange={(on) => {
              if (on && partner === null) setSub('shareWith')
              else setShared(on)
            }}
          />
        </div>

        {sharedActive && (
          <div className="rounded-[22px] border border-sand bg-white/60 p-4">
            <SectionLabel>¿Con quién?</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-forest pl-1.5 pr-5 text-[17px] font-extrabold text-cream">
                <Avatar name={partnerName} size="sm" />
                {partner}
              </span>
              <button
                type="button"
                onClick={() => setSub('invite')}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-dashed border-[#d9c9a6] px-4 text-[16px] font-extrabold"
              >
                <Plus aria-hidden="true" className="size-5" />
                Invitar con un código
              </button>
            </div>
            <div className="mt-4">
              <SplitPanel
                mode={split}
                onModeChange={setSplit}
                partner={partnerName}
                mineCents={mine}
                theirsCents={theirs}
                incomeShare={INCOME_SHARE}
              />
            </div>
            <p className="mt-3 text-[15px] leading-5">
              {split === 'half'
                ? `${formatArs(mine)} cada uno por mes.`
                : `Vos ${formatArs(mine)} y ${partner} ${formatArs(theirs)} por mes.`}{' '}
              {partner} recibe la invitación y ve la meta desde su app.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button className="mt-1" onClick={create}>
          Crear meta
        </Button>
      </div>
    </BottomSheet>
  )
}
