import { CalendarDays, CreditCard } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { formatCompactDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import {
  addDays,
  argentinaTodayIso,
  isIsoDate,
  weekdayIndex,
  type IsoDate,
} from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { ChoiceChip, IconTile, OptionRow, SectionLabel, Toggle } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateSavingsGoal, useSavings, useUpdateSavingsGoal } from '../api/useSavings'
import { addMonths } from '../domain/goals'
import {
  describeSchedule,
  FREQUENCY_LABELS,
  nextMonthDay,
  nextWeekday,
  SAVINGS_KINDS,
  savingsKind,
  WEEKDAYS,
  type GoalFrequency,
  type SavingsGoal,
} from '../domain/savings'

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink placeholder:text-text-muted'
const FREQUENCIES: GoalFrequency[] = ['weekly', 'biweekly', 'monthly', 'free']
const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export interface SavingsGoalPrefill {
  name: string
  amountCents: number
  months: number
}

type Horizon = 'none' | 3 | 6 | 12 | 'date'

/** Default first reminder for a frequency: the same weekday next week, or the same day of the month next month. */
function defaultFirstDate(frequency: GoalFrequency, today: IsoDate): IsoDate {
  if (frequency === 'monthly') return nextMonthDay(Number(today.slice(8, 10)), addDays(today, 1))
  return addDays(today, 7)
}

/**
 * Nueva meta / Editar meta. A goal reserves money that already is in one of the person's accounts: it never
 * spends or moves it. Reminders are optional, and so is the suggested amount per contribution.
 */
export function SavingsGoalFormSheet({
  goal,
  prefill,
  onClose,
}: {
  goal?: SavingsGoal
  prefill?: SavingsGoalPrefill
  onClose: () => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const savings = useSavings()
  const create = useCreateSavingsGoal()
  const update = useUpdateSavingsGoal()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const editing = Boolean(goal)

  const accounts = useMemo(
    () => (savings.data?.accounts ?? []).filter((a) => !a.archived),
    [savings.data?.accounts],
  )

  const [name, setName] = useState(goal?.name ?? prefill?.name ?? '')
  const [icon, setIcon] = useState<string>(goal?.icon ?? 'viaje')
  const [targetText, setTargetText] = useState(
    goal
      ? formatAmountInput(goal.targetCents)
      : prefill
        ? formatAmountInput(prefill.amountCents)
        : '',
  )
  const [accountId, setAccountId] = useState(goal?.accountId ?? '')
  const initialHorizon: Horizon = goal
    ? goal.targetDate
      ? 'date'
      : 'none'
    : prefill && [3, 6, 12].includes(prefill.months)
      ? (prefill.months as 3 | 6 | 12)
      : 'none'
  const [horizon, setHorizon] = useState<Horizon>(initialHorizon)
  const [date, setDate] = useState<IsoDate>(goal?.targetDate ?? addMonths(today, 6))
  const [initialText, setInitialText] = useState('')
  const [frequency, setFrequency] = useState<GoalFrequency>(goal?.frequency ?? 'free')
  const [suggestedText, setSuggestedText] = useState(
    goal?.suggestedCents ? formatAmountInput(goal.suggestedCents) : '',
  )
  const [remind, setRemind] = useState(goal?.remind ?? false)
  const [firstDate, setFirstDate] = useState<IsoDate>(
    goal?.nextReminderOn ?? defaultFirstDate('weekly', today),
  )
  // The day of the month is typed freely (it can be empty while typing); the date follows once it is a valid day.
  const [dayText, setDayText] = useState(String(Number(firstDate.slice(8, 10)) || 1))
  const [error, setError] = useState<string | null>(null)

  function applyFirstDate(next: IsoDate) {
    setFirstDate(next)
    if (isIsoDate(next)) setDayText(String(Number(next.slice(8, 10))))
  }

  const effectiveAccountId = accountId || accounts[0]?.id || ''
  const account = accounts.find((a) => a.id === effectiveAccountId)
  const target = parseAmountInput(targetText) ?? 0
  const initial = parseAmountInput(initialText) ?? 0
  const suggested = parseAmountInput(suggestedText) ?? 0
  // Money already reserved by this goal is not "free" for itself when it stays in the same account.
  const freeCents = account ? Math.max(0, account.freeCents) : 0
  const initialTooMuch = !editing && initial > freeCents
  const targetDate: IsoDate | null =
    horizon === 'none' ? null : horizon === 'date' ? date : addMonths(today, horizon)
  const remindOn = remind && frequency !== 'free'
  const firstDateOk =
    !remindOn ||
    (isIsoDate(firstDate) &&
      (firstDate >= today || (editing && firstDate === goal?.nextReminderOn)))
  const valid =
    name.trim().length > 0 &&
    target > 0 &&
    effectiveAccountId !== '' &&
    !initialTooMuch &&
    firstDateOk &&
    (suggestedText.trim() === '' || suggested > 0) &&
    (horizon !== 'date' || (isIsoDate(date) && date >= today))

  function pickKind(id: string) {
    const kind = savingsKind(id)
    const previous = savingsKind(icon)
    setIcon(id)
    // A suggested name is replaced by the next suggestion; a name the person typed is never touched.
    if (!name.trim() || name === previous.suggestedName) setName(kind.suggestedName)
  }

  function pickFrequency(next: GoalFrequency) {
    const wasFree = frequency === 'free'
    setFrequency(next)
    if (next === 'free') return
    // A new kind of schedule (weekday <-> day of the month) starts from a sensible date; the same kind keeps the choice.
    if (wasFree || (next === 'monthly') !== (frequency === 'monthly'))
      setFirstDate(defaultFirstDate(next, today))
    // Saving on a schedule comes with its reminder switched on; the person can turn it off.
    if (wasFree && !editing) setRemind(true)
  }

  async function save() {
    if (!valid || saving.current) return
    saving.current = true
    setError(null)
    const input = {
      name: name.trim(),
      icon,
      targetCents: target,
      accountId: effectiveAccountId,
      targetDate,
      frequency,
      suggestedCents: suggested > 0 ? suggested : null,
      remind: remindOn,
      firstReminderOn: remindOn ? firstDate : null,
    }
    try {
      if (goal) await update.mutateAsync({ id: goal.id, input })
      else
        await create.mutateAsync({
          input: { ...input, initialCents: initial > 0 ? initial : null },
          requestKey: requestKey.current,
        })
      toast.show(goal ? 'Meta actualizada' : 'Meta creada')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  const busy = create.isPending || update.isPending
  const schedule = remindOn ? describeSchedule(frequency, firstDate) : null

  return (
    <BottomSheet title={editing ? 'Editar meta' : 'Nueva meta'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Para qué ahorrás?</SectionLabel>
        <div role="group" aria-label="Tipo de meta" className="flex flex-wrap gap-2">
          {SAVINGS_KINDS.map((k) => (
            <ChoiceChip
              key={k.id}
              icon={k.icon}
              selected={icon === k.id}
              onClick={() => pickKind(k.id)}
              className="min-h-11 px-4 text-[16px]"
            >
              {k.label}
            </ChoiceChip>
          ))}
        </div>

        <SectionLabel className="mt-1">Nombre</SectionLabel>
        <div className="flex items-center gap-3">
          <IconTile
            icon={savingsKind(icon).icon}
            bg={savingsKind(icon).bg}
            color={savingsKind(icon).color}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Viaje a Brasil"
            aria-label="Nombre"
            maxLength={40}
            className={fieldClass}
          />
        </div>

        <SectionLabel className="mt-1">¿Cuánto necesitás?</SectionLabel>
        <AmountInput
          aria-label="Monto objetivo"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
        />

        <SectionLabel className="mt-1">¿En qué cuenta está la plata?</SectionLabel>
        {savings.isLoading ? (
          <p className="text-[15px] text-text-muted">Cargando tus cuentas…</p>
        ) : accounts.length === 0 ? (
          <p role="alert" className="text-[15px] leading-5 text-text-muted">
            Necesitás una cuenta de efectivo, banco o billetera para reservar dinero. Agregala en
            Medios de pago.
          </p>
        ) : (
          <select
            aria-label="Cuenta de la meta"
            value={effectiveAccountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={fieldClass}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · libre {formatArs(Math.max(0, a.freeCents))}
              </option>
            ))}
          </select>
        )}
        <p className="text-[14px] leading-5 text-text-muted">
          La plata sigue en tu cuenta: la meta solo la aparta, no es un gasto ni una transferencia.
        </p>

        {!editing && (
          <>
            <SectionLabel className="mt-1">¿Ya apartás algo hoy? (opcional)</SectionLabel>
            <AmountInput
              scale="md"
              aria-label="Monto inicial reservado"
              placeholder="0"
              value={initialText}
              onChange={(e) => setInitialText(e.target.value)}
              invalid={initialTooMuch}
            />
            {initialTooMuch && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-[14px] bg-blush/60 p-3 text-[15px] leading-5"
              >
                <span>
                  {account?.name} tiene {formatArs(freeCents)} libres: el resto ya está reservado
                  para otras metas.
                </span>
                {freeCents > 0 && (
                  <Button
                    variant="dark"
                    onClick={() => setInitialText(formatAmountInput(freeCents))}
                  >
                    Usar {formatArs(freeCents)}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        <SectionLabel className="mt-1">¿Para cuándo? (opcional)</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip selected={horizon === 'none'} onClick={() => setHorizon('none')}>
            Sin fecha
          </ChoiceChip>
          {([3, 6, 12] as const).map((m) => (
            <ChoiceChip key={m} selected={horizon === m} onClick={() => setHorizon(m)}>
              {m === 12 ? '1 año' : `${m} meses`}
            </ChoiceChip>
          ))}
          <ChoiceChip
            icon={CalendarDays}
            selected={horizon === 'date'}
            onClick={() => setHorizon('date')}
          >
            {horizon === 'date' && isIsoDate(date) ? formatCompactDate(date) : 'Elegir fecha'}
          </ChoiceChip>
        </div>
        {horizon === 'date' && (
          <input
            type="date"
            aria-label="Fecha objetivo"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        )}

        <SectionLabel className="mt-1">¿Cada cuánto querés ahorrar?</SectionLabel>
        <div role="group" aria-label="Frecuencia de ahorro" className="flex flex-wrap gap-2">
          {FREQUENCIES.map((f) => (
            <ChoiceChip
              key={f}
              selected={frequency === f}
              onClick={() => pickFrequency(f)}
              className="min-h-11 px-4 text-[16px]"
            >
              {FREQUENCY_LABELS[f]}
            </ChoiceChip>
          ))}
        </div>
        <p className="text-[14px] leading-5 text-text-muted">
          Es solo una guía: podés aportar o retirar cuando quieras y cualquier importe.
        </p>

        <SectionLabel className="mt-1">Importe orientativo por aporte (opcional)</SectionLabel>
        <AmountInput
          scale="md"
          aria-label="Importe orientativo"
          placeholder="Sin importe"
          value={suggestedText}
          onChange={(e) => setSuggestedText(e.target.value)}
        />

        {frequency !== 'free' && (
          <div className="flex flex-col gap-3 rounded-[22px] border border-sand bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex-1">
                <span className="block text-[17px] font-extrabold">Recordarme ahorrar</span>
                <span className="block text-[14px] text-text-muted">
                  Un aviso dentro de Moni. No descuenta nada ni aporta solo.
                </span>
              </span>
              <Toggle label="Recordarme ahorrar" checked={remind} onChange={setRemind} />
            </div>
            {remind && (
              <>
                {frequency === 'monthly' ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                      Día del mes
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      aria-label="Día del mes"
                      value={dayText}
                      onChange={(e) => {
                        setDayText(e.target.value)
                        const day = Number(e.target.value)
                        if (Number.isInteger(day) && day >= 1 && day <= 31)
                          setFirstDate(nextMonthDay(day, today))
                      }}
                      className={fieldClass}
                    />
                  </label>
                ) : (
                  <div role="group" aria-label="Día de la semana" className="flex gap-1.5">
                    {WEEKDAY_LETTERS.map((letter, i) => (
                      <button
                        key={WEEKDAYS[i]}
                        type="button"
                        aria-label={WEEKDAYS[i]}
                        aria-pressed={weekdayIndex(firstDate) === i}
                        onClick={() => applyFirstDate(nextWeekday(i, addDays(today, 1)))}
                        className={cn(
                          'flex size-11 flex-1 items-center justify-center rounded-full border-2 font-display text-[16px] font-extrabold',
                          weekdayIndex(firstDate) === i
                            ? 'border-ink bg-forest text-cream'
                            : 'border-sand bg-card text-ink',
                        )}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                    Primer recordatorio
                  </span>
                  <input
                    type="date"
                    aria-label="Primer recordatorio"
                    value={firstDate}
                    min={today}
                    onChange={(e) => applyFirstDate(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                {schedule && <p className="text-[15px] font-extrabold text-ink">{schedule}</p>}
              </>
            )}
          </div>
        )}

        {!editing && (
          <OptionRow
            icon={<IconTile icon={CreditCard} bg="#fdeab8" />}
            title="¿Lo vas a pagar en cuotas?"
            subtitle="Compará y Moni te dice si conviene"
            onClick={() =>
              navigate('/metas/cuotas', {
                state: { name: name.trim() || 'Notebook nueva', amountCents: target || 900_000_00 },
              })
            }
          />
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button className="mt-1" disabled={!valid || busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear meta'}
        </Button>
      </div>
    </BottomSheet>
  )
}
