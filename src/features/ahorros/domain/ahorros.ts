import { toCents, type Cents } from '@/shared/lib/money'

export type AhorroCurrency = 'ARS' | 'USD'
export type AhorroKind = 'opening' | 'deposit' | 'withdrawal'

export const CURRENCIES: readonly { code: AhorroCurrency; label: string }[] = [
  { code: 'ARS', label: 'Pesos' },
  { code: 'USD', label: 'Dólares' },
]

export interface AhorroEntry {
  id: string
  currency: AhorroCurrency
  kind: AhorroKind
  amountCents: Cents
  occurredOn: string
  note: string | null
  accountId: string | null
  status: 'posted' | 'voided'
  createdAt: string
}

export interface AhorroRow {
  id: string
  currency: AhorroCurrency
  kind: AhorroKind
  amount: number | string
  occurred_on: string
  note: string | null
  account_id: string | null
  status: 'posted' | 'voided'
  created_at: string
}

export function toEntry(row: AhorroRow): AhorroEntry {
  return {
    id: row.id,
    currency: row.currency,
    kind: row.kind,
    amountCents: toCents(row.amount),
    occurredOn: row.occurred_on,
    note: row.note,
    accountId: row.account_id,
    status: row.status,
    createdAt: row.created_at,
  }
}

/** What is saved in one currency: saldo inicial + aportes - retiros of the posted entries. Currencies are never mixed. */
export function balanceOf(entries: readonly AhorroEntry[], currency: AhorroCurrency): Cents {
  return entries
    .filter((e) => e.currency === currency && e.status === 'posted')
    .reduce((sum, e) => sum + (e.kind === 'withdrawal' ? -e.amountCents : e.amountCents), 0)
}

const NUMBER = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** "$150.000" or "US$ 300": the symbol says the currency and the number is never converted. */
export function formatSaving(cents: Cents, currency: AhorroCurrency): string {
  const text = NUMBER.format(Math.abs(cents) / 100)
  const sign = cents < 0 ? '-' : ''
  return currency === 'USD' ? `${sign}US$ ${text}` : `${sign}$${text}`
}

export const KIND_LABELS: Record<AhorroKind, string> = {
  opening: 'Saldo inicial',
  deposit: 'Aporte',
  withdrawal: 'Retiro',
}

/**
 * The currencies to offer: pesos always; dollars only when the person turned them on (Configuración) or already has dollar savings,
 * which are never hidden.
 */
export function visibleCurrencies(usesUsd: boolean, entries: readonly AhorroEntry[]): typeof CURRENCIES {
  const hasUsd = entries.some((e) => e.currency === 'USD' && e.status === 'posted')
  return usesUsd || hasUsd ? CURRENCIES : CURRENCIES.filter((c) => c.code === 'ARS')
}
