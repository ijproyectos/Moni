import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { formatLongDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { fromCents, type Cents } from '@/shared/lib/money'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import { ChoiceChip } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useSaveRecurring } from '../api/useGroups'
import {
  HOME_EXPENSE_NAMES,
  RECURRING_PERIOD_LABELS,
  type GroupMember,
  type GroupRecurring,
  type RecurringPeriod,
} from '../domain/group'
import { fieldClass } from './styles'

const memberName = (m: GroupMember, meId: string | undefined) => (m.userId === meId ? 'Vos' : (m.displayName ?? 'Integrante'))

/**
 * Create or edit a recurring expense of a home group (administrators). Everything is saved in Supabase and only said to be saved
 * when the server confirms it. Splits: equal parts, or percentages (the logic the group already has).
 */
export function RecurringFormSheet({
  groupId,
  members,
  meId,
  editing,
  onClose,
}: {
  groupId: string
  members: readonly GroupMember[]
  meId: string | undefined
  editing: GroupRecurring | null
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveRecurring(groupId)
  const active = members.filter((m) => m.leftAt === null)
  // One key per opening of the form: a double tap or a retry creates it only once.
  const [requestKey] = useState(() => crypto.randomUUID())

  const [name, setName] = useState(editing?.name ?? '')
  const [templateSlug, setTemplateSlug] = useState<string | null>(editing?.templateSlug ?? 'hogar')
  const [amount, setAmount] = useState(editing ? fromCents(editing.amountCents) : '')
  const [period, setPeriod] = useState<RecurringPeriod>(editing?.period ?? 'monthly')
  const [anchorOn, setAnchorOn] = useState<IsoDate>(editing?.anchorOn ?? todayIso())
  const [pickingDate, setPickingDate] = useState(false)
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? meId ?? active[0]?.userId ?? '')
  const [splitMethod, setSplitMethod] = useState<'equal' | 'percent'>(editing?.splitMethod ?? 'equal')
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(editing ? editing.participants.map((p) => p.userId) : active.map((m) => m.userId)),
  )
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries((editing?.participants ?? []).filter((p) => p.percent !== null).map((p) => [p.userId, String(p.percent)])),
  )
  const [error, setError] = useState<string | null>(null)

  const amountCents: Cents | null = parseAmountInput(amount)
  const ids = active.filter((m) => chosen.has(m.userId)).map((m) => m.userId)
  const pct = (id: string) => Number((percents[id] ?? '').replace(',', '.'))
  const pctSum = ids.reduce((sum, id) => sum + (Number.isFinite(pct(id)) ? pct(id) : 0), 0)

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    setError(null)
    if (name.trim() === '') return setError('Escribí qué gasto es (por ejemplo, Alquiler).')
    if (!amountCents || amountCents <= 0) return setError('Ingresá un importe mayor a cero.')
    if (ids.length === 0) return setError('Elegí al menos una persona para dividir.')
    if (splitMethod === 'percent' && Math.round(pctSum * 100) !== 10_000) return setError('Los porcentajes tienen que sumar 100.')
    try {
      await save.mutateAsync({
        id: editing?.id ?? null,
        requestKey,
        values: {
          name: name.trim(),
          templateSlug,
          amountCents,
          period,
          anchorOn,
          paidBy,
          splitMethod,
          participants: ids.map((userId) => ({ userId, percent: splitMethod === 'percent' ? pct(userId) : null })),
        },
      })
      toast.show(editing ? 'Cambios guardados' : 'Gasto recurrente creado', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  if (pickingDate) {
    return (
      <DatePickerSheet
        title="¿Cuándo vence?"
        value={anchorOn}
        onClose={() => setPickingDate(false)}
        onConfirm={(d) => {
          setAnchorOn(d)
          setPickingDate(false)
        }}
        hint={() => 'Se repite ese día del mes. Moni te avisa cuando llegue.'}
      />
    )
  }

  return (
    <BottomSheet title={editing ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {!editing && (
          <div role="group" aria-label="Tipo de gasto" className="flex flex-wrap gap-2">
            {HOME_EXPENSE_NAMES.map((o) => (
              <ChoiceChip
                key={o.name}
                selected={name === o.name}
                onClick={() => {
                  setName(o.name)
                  setTemplateSlug(o.templateSlug)
                }}
                className="min-h-11 px-4 text-[15px]"
              >
                {o.name}
              </ChoiceChip>
            ))}
          </div>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del gasto"
          placeholder="Nombre (por ejemplo, Alquiler)"
          maxLength={60}
          className={fieldClass}
        />
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe estimado" scale="md" />
        <p className="-mt-2 text-[13px] leading-5 text-text-muted">
          Es el importe de referencia: cada mes podés cambiarlo antes de confirmar (por ejemplo, la luz).
        </p>
        <SegmentedControl
          label="Cada cuánto se repite"
          value={period}
          onChange={setPeriod}
          options={(Object.keys(RECURRING_PERIOD_LABELS) as RecurringPeriod[]).map((value) => ({
            value,
            label: value === 'monthly' ? 'Mensual' : value === 'bimonthly' ? 'Bimestral' : 'Anual',
          }))}
        />
        <button
          type="button"
          onClick={() => setPickingDate(true)}
          className="flex min-h-14 items-center gap-3 rounded-[18px] border border-line bg-card px-4 text-left"
        >
          <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
          <span className="flex-1">
            <span className="block text-[13px] text-text-muted">Vence el</span>
            <span className="block text-[16px] font-extrabold">{formatLongDate(anchorOn)}</span>
          </span>
        </button>

        <label className="flex flex-col gap-1.5 text-[14px] font-bold">
          Quién lo paga
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={cn(fieldClass, 'font-normal')}>
            {active.map((m) => (
              <option key={m.userId} value={m.userId}>
                {memberName(m, meId)}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[14px] font-bold">Entre quiénes se divide</p>
        <SegmentedControl
          label="Cómo se divide"
          value={splitMethod}
          onChange={setSplitMethod}
          options={[
            { value: 'equal', label: 'Partes iguales' },
            { value: 'percent', label: 'Porcentajes' },
          ]}
        />
        <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-3">
          {active.map((m) => (
            <li key={m.userId} className="flex min-h-12 items-center gap-3 py-1.5">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-[16px] font-extrabold">
                <input
                  type="checkbox"
                  checked={chosen.has(m.userId)}
                  onChange={() => toggle(m.userId)}
                  className="size-5 accent-forest"
                />
                <span className="truncate">{memberName(m, meId)}</span>
              </label>
              {splitMethod === 'percent' && chosen.has(m.userId) && (
                <span className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    aria-label={`Porcentaje de ${memberName(m, meId)}`}
                    value={percents[m.userId] ?? ''}
                    onChange={(e) => setPercents((p) => ({ ...p, [m.userId]: e.target.value }))}
                    className="h-10 w-16 rounded-xl border border-line bg-canvas px-2 text-right text-[16px]"
                  />
                  <span className="text-[14px] text-text-muted">%</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        {splitMethod === 'percent' && (
          <p className={cn('text-[13px]', Math.round(pctSum * 100) === 10_000 ? 'text-text-muted' : 'text-expense')}>
            Suman {pctSum.toLocaleString('es-AR')} % (tienen que ser 100 %).
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-[15px] text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear gasto recurrente'}
        </Button>
      </div>
    </BottomSheet>
  )
}
