import { useMemo, useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { checkOverdraft, type OverdraftWarning } from '@/features/accounts/domain/overdraft'
import { isCreditCard } from '@/features/accounts/domain/account'
import { OverdraftSheet } from '@/features/accounts/ui/OverdraftSheet'
import { checkCreditLimit, type CreditLimitWarning } from '@/features/cards/domain/creditLimit'
import { CreditLimitSheet } from '@/features/cards/ui/CreditLimitSheet'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { formatCompactDate, formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { addDays, argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { SectionLabel, Toggle } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  useDuplicateCandidates,
  useLinkExistingExpense,
  useRegisterPayment,
} from '../api/useFixedExpenses'
import type { PendingBill } from '../domain/fixedExpense'
import { paymentQuestion } from '../domain/labels'
import { KindTile } from './KindTile'

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted'

type Pending =
  | { type: 'overdraft'; warning: OverdraftWarning; accountName: string }
  | { type: 'limit'; warning: CreditLimitWarning; accountName: string }

/**
 * "Registrar pago": the only moment a fixed expense becomes a movement. The real amount and the payment day
 * are typed here (the due date stays as it was), and an expense the person already typed can be linked instead of
 * creating a second one.
 */
export function RegisterPaymentSheet({
  bill,
  onClose,
}: {
  bill: PendingBill
  onClose: () => void
}) {
  const toast = useToast()
  const accounts = useAccounts()
  const register = useRegisterPayment()
  const link = useLinkExistingExpense()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const earliest = addDays(bill.occurrence.dueOn, -90)

  const accountList = useMemo(() => accounts.data ?? [], [accounts.data])
  const [text, setText] = useState(formatAmountInput(bill.occurrence.expectedCents))
  const [paidOn, setPaidOn] = useState(today)
  const [accountId, setAccountId] = useState(bill.expense.accountId)
  const [updateEstimate, setUpdateEstimate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const amountCents = parseAmountInput(text) ?? 0
  const dateOk = isIsoDate(paidOn) && paidOn <= today && paidOn >= earliest
  const valid = amountCents > 0 && dateOk && accountId !== ''
  const duplicates = useDuplicateCandidates({
    occurrenceId: bill.occurrence.id,
    amountCents,
    paidOn,
    accountId,
    enabled: valid,
  })
  const candidates = duplicates.data ?? []

  async function commit() {
    if (saving.current) return
    saving.current = true
    setError(null)
    try {
      await register.mutateAsync({
        occurrenceId: bill.occurrence.id,
        amountCents,
        paidOn,
        accountId,
        updateEstimate,
        requestKey: requestKey.current,
      })
      toast.show('Pago registrado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
      setPending(null)
    }
  }

  function submit() {
    if (!valid || saving.current) return
    const account = accountList.find((a) => a.id === accountId)
    if (account) {
      if (isCreditCard(account)) {
        const warning = checkCreditLimit({
          limitCents: account.creditLimitCents,
          balanceCents: account.balanceCents,
          amountCents,
        })
        if (warning) return setPending({ type: 'limit', warning, accountName: account.name })
      } else {
        const warning = checkOverdraft({ balanceCents: account.balanceCents, amountCents })
        if (warning) return setPending({ type: 'overdraft', warning, accountName: account.name })
      }
    }
    void commit()
  }

  async function linkExisting(transactionId: string) {
    if (saving.current) return
    saving.current = true
    try {
      await link.mutateAsync({ occurrenceId: bill.occurrence.id, transactionId })
      toast.show('Listo: el vencimiento quedó pagado con el gasto que ya cargaste')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  const busy = register.isPending || link.isPending

  return (
    <BottomSheet title="Registrar pago" subtitle={bill.expense.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <KindTile kindId={bill.expense.kindId} size="lg" />
          <p className="text-[18px] font-extrabold leading-6 text-forest">
            {paymentQuestion(bill)}
          </p>
        </div>

        <p className="text-[14px] leading-5 text-text-muted">
          Moni no hace el pago: acá registrás lo que ya pagaste. Recién entonces se crea el gasto y
          cambia el saldo o la deuda de la tarjeta. Estimado:{' '}
          <strong>{formatArs(bill.occurrence.expectedCents)}</strong>.
        </p>

        <div>
          <SectionLabel>Importe real pagado</SectionLabel>
          <AmountInput
            aria-label="Importe real"
            prefix="$"
            value={text}
            onChange={(e) => setText(e.target.value)}
            invalid={text.trim() !== '' && amountCents === 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Fecha de pago
            </span>
            <input
              type="date"
              value={paidOn}
              min={earliest}
              max={today}
              onChange={(e) => setPaidOn(e.target.value)}
              aria-label="Fecha de pago"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Cuenta o tarjeta
            </span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Cuenta o tarjeta"
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
        <p className="-mt-2 text-[14px] text-text-muted">
          Vencimiento: {formatCompactDate(bill.occurrence.dueOn)}
          {bill.occurrence.rescheduledTo &&
            ` · movido al ${formatCompactDate(bill.occurrence.rescheduledTo)}`}
        </p>

        {candidates.length > 0 && (
          <div role="alert" className="flex flex-col gap-2 rounded-[14px] bg-gold/30 p-3">
            <p className="text-[14px] leading-5">
              <strong className="font-extrabold">Posible duplicado:</strong> ya tenés cargado{' '}
              {candidates.length === 1 ? 'este gasto' : 'estos gastos'} parecido
              {candidates.length === 1 ? '' : 's'}. Si es el mismo pago, usalo y no se crea otro.
            </p>
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[14px] leading-5">
                  {formatArs(c.amountCents)} el {formatDayMonth(c.occurredOn)}
                  {c.note ? ` («${c.note}»)` : ''}
                </span>
                <Button
                  variant="dark"
                  disabled={busy}
                  onClick={() => void linkExisting(c.id)}
                  aria-label={`Ya lo cargué: ${formatArs(c.amountCents)} el ${formatDayMonth(c.occurredOn)}`}
                >
                  Ya lo cargué
                </Button>
              </div>
            ))}
            <p className="text-[13px] text-text-muted">
              Si no es el mismo, seguí con «Registrar pago» y se crea un gasto nuevo.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-[18px] border border-sand bg-white px-4 py-3">
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">
              Usar este importe como próximo estimado
            </span>
            <span className="block text-[14px] text-text-muted">Para el siguiente vencimiento</span>
          </span>
          <Toggle
            label="Usar este importe como próximo estimado"
            checked={updateEstimate}
            onChange={setUpdateEstimate}
          />
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button disabled={!valid || busy} onClick={submit}>
          {register.isPending ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </div>

      {pending?.type === 'overdraft' && (
        <OverdraftSheet
          accountName={pending.accountName}
          warning={pending.warning}
          isBusy={register.isPending}
          onCancel={() => setPending(null)}
          onContinue={() => void commit()}
        />
      )}
      {pending?.type === 'limit' && (
        <CreditLimitSheet
          cardName={pending.accountName}
          warning={pending.warning}
          isBusy={register.isPending}
          onCancel={() => setPending(null)}
          onContinue={() => void commit()}
        />
      )}
    </BottomSheet>
  )
}
