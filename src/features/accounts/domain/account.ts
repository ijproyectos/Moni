import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import type { AccountKind } from '@/shared/lib/database.types'
import type { Cents } from '@/shared/lib/money'

export const ACCOUNT_KINDS: readonly AccountKind[] = ['cash', 'bank', 'wallet', 'credit_card']

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera virtual',
  credit_card: 'Tarjeta de crédito',
}

/** Shorter names for the four-way type selector. */
export const ACCOUNT_KIND_SHORT_LABELS: Record<AccountKind, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera',
  credit_card: 'Tarjeta',
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  currency: string
  openingBalanceCents: Cents
  /** Derived by the database: opening balance plus posted movements and transfers. */
  balanceCents: Cents
  archivedAt: string | null
  /** Credit cards only. */
  creditLimitCents: Cents | null
  closingDay: number | null
  dueDay: number | null
}

/** An optional whole number of days; empty means "not set". */
const dayField = (label: string) =>
  z
    .string()
    .default('')
    .transform((value, ctx) => {
      const text = value.trim()
      if (text === '') return null
      const day = Number(text)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        ctx.addIssue({ code: 'custom', message: `${label}: un día entre 1 y 31.` })
        return z.NEVER
      }
      return day
    })

export const accountFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Ponele un nombre a la cuenta.')
      .max(40, 'Máximo 40 caracteres.'),
    kind: z.enum(['cash', 'bank', 'wallet', 'credit_card'], {
      message: 'Elegí un tipo de cuenta.',
    }),
    openingBalance: z
      .string()
      .default('')
      .transform((value, ctx) => {
        if (value.trim() === '') return 0
        const cents = parseAmountInput(value)
        if (cents === null) {
          ctx.addIssue({ code: 'custom', message: 'Ingresá un monto válido.' })
          return z.NEVER
        }
        return cents
      }),
    creditLimit: z
      .string()
      .default('')
      .transform((value, ctx) => {
        if (value.trim() === '') return null
        const cents = parseAmountInput(value)
        if (cents === null || cents <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Ingresá un límite mayor a cero.' })
          return z.NEVER
        }
        return cents
      }),
    closingDay: dayField('Cierre'),
    dueDay: dayField('Vencimiento'),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== 'credit_card') return
    if (value.closingDay === null && value.dueDay !== null) {
      ctx.addIssue({ code: 'custom', path: ['closingDay'], message: 'Completá también el cierre.' })
    }
    if (value.dueDay === null && value.closingDay !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDay'],
        message: 'Completá también el vencimiento.',
      })
    }
  })
  // Card settings only make sense on a card.
  .transform((value) =>
    value.kind === 'credit_card'
      ? value
      : { ...value, creditLimit: null, closingDay: null, dueDay: null },
  )

export type AccountFormInput = z.input<typeof accountFormSchema>
/** Parsed form: `openingBalance` and `creditLimit` are integer cents. */
export type AccountFormValues = z.output<typeof accountFormSchema>

/**
 * Credit cards work on debt: their balance is what is owed (zero or negative). Buying on the card
 * grows the debt without touching any other account; paying it is a transfer from an account.
 */
export function isCreditCard(account: Pick<Account, 'kind'>): boolean {
  return account.kind === 'credit_card'
}

/** Sum of the balances that make up "saldo disponible": active accounts only. Card debt is not money you have. */
export function availableBalance(accounts: readonly Account[]): Cents {
  return accounts.reduce(
    (sum, a) => (a.archivedAt === null && !isCreditCard(a) ? sum + a.balanceCents : sum),
    0,
  )
}

/** Debt of one card (positive); a card with credit in favor owes nothing. */
export function cardDebtOf(account: Pick<Account, 'balanceCents'>): Cents {
  return Math.max(0, -account.balanceCents)
}

/** Credit left on a card: limit minus all the debt (installments included); null without a limit. */
export function availableCredit(
  account: Pick<Account, 'creditLimitCents' | 'balanceCents'>,
): Cents | null {
  return account.creditLimitCents === null ? null : account.creditLimitCents - cardDebtOf(account)
}

/** What is owed on the active credit cards (a positive amount). */
export function cardDebt(accounts: readonly Account[]): Cents {
  return accounts.reduce(
    (sum, a) =>
      a.archivedAt === null && isCreditCard(a) ? sum + Math.max(0, -a.balanceCents) : sum,
    0,
  )
}

/**
 * Signed amount typed in "Ajustar saldo" → the target balance to store. A card is typed as the debt
 * ("debo 50.000"), so its balance is the negative of it; a typed minus on a card means money in favor.
 */
export function adjustmentTarget(account: Pick<Account, 'kind'>, typedCents: Cents): Cents {
  return isCreditCard(account) ? -typedCents : typedCents
}

/** Parses "1.500", "-250" or "$ 1.500,50" (a leading minus is allowed); null when it is not an amount. */
export function parseSignedAmount(input: string): Cents | null {
  const text = input.trim()
  const negative = text.startsWith('-')
  const cents = parseAmountInput(negative ? text.slice(1) : text)
  return cents === null ? null : negative ? -cents : cents
}
