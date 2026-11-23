import { useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip, SectionLabel } from '@/shared/ui/kit'
import { FIELD_CLASS as fieldClass } from '@/shared/ui/fieldStyles'
import { useToast } from '@/shared/ui/toastContext'
import { useAhorros, useCreateAhorro } from '../api/useAhorros'
import { CURRENCIES, KIND_LABELS, type AhorroCurrency, type AhorroKind } from '../domain/ahorros'

const TITLES: Record<AhorroKind, string> = {
  deposit: 'Agregar ahorro',
  withdrawal: 'Retirar ahorro',
  opening: 'Saldo inicial',
}

/**
 * One form for the three things a saving can do: add, withdraw, or load what was already saved (saldo inicial, which is not an income).
 * Pesos can come from (or go back to) one of the person's accounts: that money is reserved there, never counted twice.
 * Dollars have no account. The request key makes a double tap on "Guardar" a single entry.
 */
export function AhorroSheet({
  kind,
  currency: initialCurrency = 'ARS',
  initial,
  onClose,
}: {
  kind: AhorroKind
  currency?: AhorroCurrency
  /** What the movement form already had typed when the person chose to register it as savings. */
  initial?: { amountText?: string; accountId?: string | null; date?: string; note?: string }
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateAhorro()
  const accounts = useAccounts()
  const [currency, setCurrency] = useState<AhorroCurrency>(initialCurrency)
  const [amountText, setAmountText] = useState(initial?.amountText ?? '')
  const [accountId, setAccountId] = useState<string | null>(initial?.accountId || null)
  const [date, setDate] = useState(initial?.date || todayIso())
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const requestKey = useRef(crypto.randomUUID())
  const cents = parseAmountInput(amountText) ?? 0
  const entries = useAhorros().data ?? []
  // Money set aside from each account (deposits from it minus withdrawals back to it): a withdrawal can only go back where it is reserved.
  const reservedIn = (accountId: string) =>
    entries
      .filter((e) => e.status === 'posted' && e.accountId === accountId)
      .reduce((sum, e) => sum + (e.kind === 'withdrawal' ? -e.amountCents : e.amountCents), 0)
  const usable = (accounts.data ?? []).filter(
    (a) => a.kind !== 'credit_card' && !a.archivedAt && (kind !== 'withdrawal' || reservedIn(a.id) > 0),
  )
  const canPickAccount = currency === 'ARS' && kind !== 'opening' && usable.length > 0

  async function save() {
    if (create.isPending) return
    setError(null)
    if (cents <= 0) return setError('Poné un importe.')
    try {
      await create.mutateAsync({
        currency,
        kind,
        amountCents: cents,
        occurredOn: date,
        note,
        accountId: currency === 'ARS' && kind !== 'opening' ? accountId : null,
        requestKey: requestKey.current,
      })
      toast.show(kind === 'withdrawal' ? 'Retiro guardado' : 'Ahorro guardado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title={TITLES[kind]} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Moneda" className="flex gap-2">
          {CURRENCIES.map((c) => (
            <ChoiceChip
              key={c.code}
              selected={currency === c.code}
              onClick={() => {
                setCurrency(c.code)
                if (c.code === 'USD') setAccountId(null)
              }}
              className="min-h-11 flex-1 justify-center"
            >
              {c.label}
            </ChoiceChip>
          ))}
        </div>
        <SectionLabel>{kind === 'opening' ? '¿Cuánto tenías ahorrado?' : '¿Cuánto?'}</SectionLabel>
        <AmountInput
          aria-label="Importe"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
        {canPickAccount && (
          <>
            <SectionLabel>{kind === 'deposit' ? 'Sale de la cuenta' : 'Vuelve a la cuenta'}</SectionLabel>
            <div role="group" aria-label="Cuenta" className="flex flex-wrap gap-2">
              <ChoiceChip selected={accountId === null} onClick={() => setAccountId(null)} className="min-h-11">
                Ninguna
              </ChoiceChip>
              {usable.map((a) => (
                <ChoiceChip key={a.id} selected={accountId === a.id} onClick={() => setAccountId(a.id)} className="min-h-11">
                  {a.name}
                </ChoiceChip>
              ))}
            </div>
          </>
        )}
        <label className="flex flex-col gap-1">
          <SectionLabel>Fecha</SectionLabel>
          <input type="date" max={todayIso()} className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <input
          aria-label="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Nota (opcional)"
          className={fieldClass}
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={create.isPending}>
          {create.isPending ? 'Guardando…' : kind === 'withdrawal' ? 'Retirar' : 'Guardar'}
        </Button>
        <p className="sr-only">{KIND_LABELS[kind]}</p>
      </div>
    </BottomSheet>
  )
}
