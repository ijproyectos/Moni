import { CalendarDays, CreditCard } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { useCategories } from '@/features/categories/api/useCategories'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatCompactDate, formatMonthShortYear } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { ChoiceChip, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateInstallmentPurchase } from '../api/useCards'
import {
  buildInstallmentSchedule,
  firstClosingOptions,
  statementClosingFor,
} from '../domain/cardCalendar'
import { checkCreditLimit } from '../domain/creditLimit'
import { CreditLimitSheet } from './CreditLimitSheet'

const COUNTS = [3, 6, 9, 12, 18]

/**
 * Screen 077 — Compra en cuotas, saved in the database. "Voy en la N" is the installment the person is
 * on today, so purchases already in progress can be loaded: only installments N..last are recorded.
 * The first recorded installment goes in the statement the purchase falls in; it can be moved because
 * banks differ.
 */
export function NewInstallmentSheet({
  monthlyNow,
  onClose,
}: {
  monthlyNow: number
  onClose: () => void
}) {
  const toast = useToast()
  const accounts = useAccounts()
  const categories = useCategories('expense')
  const create = useCreateInstallmentPurchase()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)

  const cards = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (a) => isCreditCard(a) && a.closingDay !== null && a.dueDay !== null,
      ),
    [accounts.data],
  )
  const expenseCategories = (categories.data ?? []).filter((c) => c.archivedAt === null)

  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [count, setCount] = useState(12)
  const [current, setCurrent] = useState(1)
  const [cardId, setCardId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [firstChoice, setFirstChoice] = useState(1) // index into firstClosingOptions: 1 = default
  const [error, setError] = useState<string | null>(null)
  const [limitPending, setLimitPending] = useState(false)

  const card = cards.find((a) => a.id === cardId) ?? cards[0] ?? null
  const total = parseAmountInput(text) ?? 0
  const safeCurrent = Math.min(current, count)

  const preview = useMemo(() => {
    if (!card || card.closingDay === null || card.dueDay === null) return null
    const defaultFirst = statementClosingFor(todayIso(), card.closingDay)
    const options = firstClosingOptions(defaultFirst, card.closingDay)
    const firstClosing = options[firstChoice] ?? defaultFirst
    const schedule = buildInstallmentSchedule({
      totalCents: total,
      count,
      current: safeCurrent,
      firstClosing,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
    })
    return { options, firstClosing, schedule }
  }, [card, total, count, safeCurrent, firstChoice])

  const schedule = preview?.schedule ?? []
  const per = schedule[0]?.amountCents ?? 0
  const committed = schedule.reduce((sum, r) => sum + r.amountCents, 0)
  const last = schedule[schedule.length - 1]
  const first = schedule[0]

  const limitWarning =
    card && committed > 0
      ? checkCreditLimit({
          limitCents: card.creditLimitCents,
          balanceCents: card.balanceCents,
          amountCents: committed,
        })
      : null

  async function save() {
    if (!card || !preview || saving.current || !categoryId) return
    saving.current = true
    setError(null)
    try {
      await create.mutateAsync({
        accountId: card.id,
        description: name.trim(),
        categoryId,
        totalCents: total,
        count,
        currentNumber: safeCurrent,
        firstClosing: preview.firstClosing,
        requestKey: requestKey.current,
      })
      toast.show('Compra en cuotas guardada')
      onClose() // the guard stays on: the sheet is gone and must not save a second time
    } catch (e) {
      saving.current = false
      setError(toUserMessage(e))
    } finally {
      setLimitPending(false)
    }
  }

  const canSave = Boolean(card && categoryId && name.trim() && per > 0)

  return (
    <BottomSheet
      title="Compra en cuotas"
      onClose={() => (limitPending ? setLimitPending(false) : onClose())}
    >
      <div className="flex flex-col gap-3">
        {cards.length === 0 && !accounts.isLoading && (
          <p
            role="status"
            className="rounded-[18px] border border-sand bg-card p-4 text-[16px] leading-6"
          >
            Para cargar cuotas primero necesitás una tarjeta con su día de cierre y de vencimiento.{' '}
            <Link to="/cuentas" onClick={onClose} className="font-extrabold underline">
              Ir a Medios de pago
            </Link>
          </p>
        )}
        <SectionLabel>¿Qué compraste?</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Heladera"
          maxLength={80}
          aria-label="Qué compraste"
          className="h-14 rounded-[18px] border border-sand bg-card px-4 text-[17px]"
        />
        <SectionLabel>Total de la compra</SectionLabel>
        <AmountInput
          aria-label="Total de la compra"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <SectionLabel>¿En cuántas cuotas?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((c) => (
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
        <SectionLabel>Categoría</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {expenseCategories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              icon={getCategoryIcon(c.icon)}
              color={c.color}
              selected={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-label={`Voy en la cuota ${safeCurrent}`}
            onClick={() => setCurrent((p) => (Math.min(p, count) % count) + 1)}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-card px-4 text-[17px] font-extrabold"
          >
            <CalendarDays aria-hidden="true" className="size-5" /> Voy en la {safeCurrent}
          </button>
          <button
            type="button"
            aria-label={`Tarjeta ${card?.name ?? ''}`}
            disabled={cards.length === 0}
            onClick={() => {
              const idx = cards.findIndex((a) => a.id === card?.id)
              setCardId(cards[(idx + 1) % cards.length]?.id ?? null)
            }}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-card px-4 text-[17px] font-extrabold disabled:opacity-60"
          >
            <CreditCard aria-hidden="true" className="size-5" /> {card?.name ?? 'Sin tarjeta'}
          </button>
        </div>
        {preview && first && (
          <button
            type="button"
            onClick={() => setFirstChoice((i) => (i + 1) % preview.options.length)}
            aria-label="Cambiar el resumen de la primera cuota"
            className="rounded-[18px] border border-sand bg-card px-4 py-3 text-left text-[15px] leading-5"
          >
            <span className="block font-extrabold">
              Cuota {first.number} en el resumen del {formatCompactDate(first.closingOn)}
            </span>
            <span className="block text-text-muted">
              Vence el {formatCompactDate(first.dueOn)}. Tocá para moverla si tu banco la pasó a
              otro resumen.
            </span>
          </button>
        )}
        {per > 0 && last && (
          <div className="rounded-[22px] bg-forest p-4 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-lime">
              Moni calcula
            </p>
            <p className="font-display text-[24px] font-extrabold">{formatArs(per)} por mes</p>
            <p className="text-[15px] leading-5 text-text-muted-on-dark">
              Terminás de pagar en {formatMonthShortYear(last.dueOn).replace(' de ', ' ')}. Tus
              cuotas pasan a {formatArs(monthlyNow + per)} por mes. Se suman {formatArs(committed)}{' '}
              a tu deuda desde hoy, y cada cuota cuenta en el gasto de su mes.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button
          disabled={!canSave || create.isPending}
          onClick={() => (limitWarning ? setLimitPending(true) : void save())}
        >
          {create.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      {limitPending && limitWarning && card && (
        <CreditLimitSheet
          cardName={card.name}
          warning={limitWarning}
          installments={count}
          isBusy={create.isPending}
          onCancel={() => setLimitPending(false)}
          onContinue={() => void save()}
        />
      )}
    </BottomSheet>
  )
}
