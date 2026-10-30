import { useMemo, useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { useCategories } from '@/features/categories/api/useCategories'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { addDays, argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { SectionLabel, Toggle } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateFixedExpense, useUpdateFixedExpense } from '../api/useFixedExpenses'
import { CUSTOM_KIND_ID, findKind, type FixedKind } from '../domain/catalog'
import { PERIOD_LABELS, type FixedExpense, type FixedPeriod } from '../domain/fixedExpense'
import { KindTile } from './KindTile'

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted'

type Target =
  | { kind: 'catalog'; fixed: FixedKind }
  | { kind: 'custom' }
  | { kind: 'edit'; expense: FixedExpense }

const PERIOD_OPTIONS = (['monthly', 'bimonthly', 'yearly'] as const).map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}))

/**
 * Nuevo gasto fijo / Editar. The amount is an ESTIMATE in pesos that can be changed every month: Moni never
 * charges it. The due date can be a few days in the past (the bill then starts pending and overdue).
 */
export function FixedExpenseFormSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Target
  onClose: () => void
  onSaved?: () => void
}) {
  const toast = useToast()
  const accounts = useAccounts()
  const categories = useCategories('expense')
  const create = useCreateFixedExpense()
  const update = useUpdateFixedExpense()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const earliest = addDays(today, -45)

  const editing = target.kind === 'edit' ? target.expense : null
  const fixed =
    target.kind === 'catalog' ? target.fixed : editing ? findKind(editing.kindId) : undefined
  const kindId = target.kind === 'catalog' ? target.fixed.id : (editing?.kindId ?? CUSTOM_KIND_ID)

  const accountList = useMemo(() => accounts.data ?? [], [accounts.data])
  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.archivedAt === null),
    [categories.data],
  )

  const [name, setName] = useState(editing?.name ?? fixed?.name ?? '')
  const [text, setText] = useState(editing ? formatAmountInput(editing.amountCents) : '')
  const [period, setPeriod] = useState<FixedPeriod>(editing?.period ?? 'monthly')
  const [dueOn, setDueOn] = useState(editing?.nextDueOn ?? today)
  const [accountId, setAccountId] = useState(editing?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [remind, setRemind] = useState(editing?.remind ?? true)
  const [error, setError] = useState<string | null>(null)

  const effectiveAccountId = accountId || accountList[0]?.id || ''
  const hinted = useMemo(() => {
    const hints = fixed?.categoryHints ?? ['servicios', 'hogar']
    return expenseCategories.find((c) => hints.includes(c.name.toLowerCase()))?.id
  }, [fixed, expenseCategories])
  const effectiveCategoryId = categoryId || hinted || ''

  const amountCents = parseAmountInput(text) ?? 0
  const valid =
    name.trim().length > 0 &&
    amountCents > 0 &&
    isIsoDate(dueOn) &&
    dueOn >= earliest &&
    effectiveAccountId !== '' &&
    effectiveCategoryId !== ''

  async function save() {
    if (!valid || saving.current) return
    saving.current = true
    setError(null)
    const input = {
      kindId,
      name: name.trim(),
      amountCents,
      period,
      nextDueOn: dueOn,
      accountId: effectiveAccountId,
      categoryId: effectiveCategoryId,
      remind,
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input })
      else await create.mutateAsync({ input, requestKey: requestKey.current })
      toast.show(editing ? `${input.name} actualizado` : `${input.name} agregado`)
      if (onSaved) onSaved()
      else onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <BottomSheet title={editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <KindTile kindId={kindId} size="lg" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Nombre del gasto"
            aria-label="Nombre del gasto"
            className={fieldClass}
          />
        </div>

        <div>
          <SectionLabel>Importe estimado en pesos</SectionLabel>
          <div className="flex items-end gap-2">
            <AmountInput
              aria-label="Importe estimado"
              prefix="$"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
          <p className="mt-1 text-[14px] leading-5 text-text-muted">
            Es solo una estimación y la podés cambiar todos los meses. Moni no descuenta nada: el
            gasto se registra cuando vos confirmás el pago con el importe real.
          </p>
        </div>

        <SegmentedControl
          label="Frecuencia"
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
        />

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Próximo vencimiento
            </span>
            <input
              type="date"
              value={dueOn}
              min={earliest}
              onChange={(e) => setDueOn(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Se paga con
            </span>
            <select
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={fieldClass}
            >
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {isCreditCard(a) ? `${a.name} · Tarjeta` : a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Categoría del gasto
          </legend>
          <div className="flex flex-wrap gap-2">
            {expenseCategories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                icon={getCategoryIcon(c.icon)}
                color={c.color}
                selected={effectiveCategoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 rounded-[18px] border border-sand bg-white px-4 py-3">
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Recordarme el vencimiento</span>
            <span className="block text-[14px] text-text-muted">
              Un día antes y el día del vencimiento, dentro de Moni (sin notificaciones push)
            </span>
          </span>
          <Toggle label="Recordarme el vencimiento" checked={remind} onChange={setRemind} />
        </div>

        {editing && (
          <p className="text-[14px] leading-5 text-text-muted">
            Los cambios valen para los próximos vencimientos. Los pagos ya registrados no se
            modifican.
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button disabled={!valid || busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </BottomSheet>
  )
}
