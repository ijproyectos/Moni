import { useMemo } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { ACCOUNT_KIND_LABELS } from '@/features/accounts/domain/account'
import { useAhorros } from '@/features/ahorros/api/useAhorros'
import { balanceOf, formatSaving } from '@/features/ahorros/domain/ahorros'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import type { FundingChoice, FundSource, TripCurrency } from '../domain/trip'
import { tripFieldClass } from './TripFormParts'

const SOURCES: readonly { value: FundSource; label: string }[] = [
  { value: 'balance', label: 'Mi saldo' },
  { value: 'savings', label: 'Mis ahorros' },
  { value: 'external', label: 'De otro lado' },
]

const HINTS: Record<FundSource, string> = {
  balance: 'Se descuenta de tu saldo y de la cuenta o tarjeta que elijas.',
  savings: 'Sale de tus ahorros: no se descuenta dos veces de tu saldo disponible.',
  external: 'Queda solo en el viaje: no toca tus saldos, ahorros ni medios de pago.',
}

/**
 * "¿De dónde sale la plata?": my balance (with the payment method), my savings (pesos or dollars) or from elsewhere. Used for the trip's
 * default and again in every expense, where it can be changed. Nothing is charged by choosing.
 */
export function FundingPicker({
  value,
  onChange,
  currency,
  idPrefix = 'funding',
}: {
  value: FundingChoice
  onChange: (next: FundingChoice) => void
  /** Currency of the amount: savings are taken from the savings of that currency. */
  currency: TripCurrency
  idPrefix?: string
}) {
  const accounts = useAccounts()
  const ahorros = useAhorros()
  const list = useMemo(() => accounts.data ?? [], [accounts.data])
  const entries = useMemo(() => ahorros.data ?? [], [ahorros.data])
  const savingsCurrency = value.ahorroCurrency ?? currency
  // Where the savings of this person are kept (the accounts that have some reserved), to take the expense from there.
  const reserved = useMemo(() => {
    const byAccount = new Map<string, number>()
    for (const e of entries) {
      if (e.status !== 'posted' || !e.accountId) continue
      byAccount.set(e.accountId, (byAccount.get(e.accountId) ?? 0) + (e.kind === 'withdrawal' ? -e.amountCents : e.amountCents))
    }
    return byAccount
  }, [entries])
  const reservedAccounts = list.filter((a) => (reserved.get(a.id) ?? 0) > 0)

  function setSource(source: FundSource) {
    if (source === 'balance') onChange({ source, accountId: value.accountId ?? list[0]?.id ?? null, ahorroCurrency: null })
    else if (source === 'savings') {
      onChange({ source, accountId: currency === 'ARS' ? (reservedAccounts[0]?.id ?? null) : null, ahorroCurrency: currency })
    } else onChange({ source, accountId: null, ahorroCurrency: null })
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl label="Origen de la plata" value={value.source} onChange={setSource} options={SOURCES} />
      {value.source === 'balance' && (
        <select
          aria-label="Medio de pago"
          id={`${idPrefix}-account`}
          value={value.accountId ?? ''}
          onChange={(e) => onChange({ ...value, accountId: e.target.value || null })}
          className={tripFieldClass}
        >
          {list.length === 0 && <option value="">Todavía no tenés medios de pago</option>}
          {list.length > 0 && !value.accountId && <option value="">Elegí un medio de pago</option>}
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {ACCOUNT_KIND_LABELS[a.kind]}
            </option>
          ))}
        </select>
      )}
      {value.source === 'savings' && (
        <>
          <p className="text-[14px] font-bold text-text-muted">
            Ahorros en {savingsCurrency === 'USD' ? 'dólares' : 'pesos'}: {formatSaving(balanceOf(entries, savingsCurrency), savingsCurrency)}
          </p>
          {savingsCurrency === 'ARS' && (
            <select
              aria-label="Cuenta donde están tus ahorros"
              id={`${idPrefix}-savings-account`}
              value={value.accountId ?? ''}
              onChange={(e) => onChange({ ...value, accountId: e.target.value || null, ahorroCurrency: 'ARS' })}
              className={tripFieldClass}
            >
              <option value="">Sin cuenta (solo en Ahorros y el viaje)</option>
              {reservedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatSaving(reserved.get(a.id) ?? 0, 'ARS')} reservados
                </option>
              ))}
            </select>
          )}
        </>
      )}
      <p className="text-[13px] leading-5 text-text-muted">{HINTS[value.source]}</p>
    </div>
  )
}
