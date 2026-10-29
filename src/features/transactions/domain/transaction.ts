import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import type { RowStatus, TransactionKind } from '@/shared/lib/database.types'
import type { Cents } from '@/shared/lib/money'
import { isIsoDate, type IsoDate } from '@/shared/lib/month'

/** Kinds the user can create in the app. The rest belong to shared expenses. */
export type EntryKind = 'expense' | 'income'

export interface Transaction {
  id: string
  accountId: string
  categoryId: string | null
  kind: TransactionKind
  amountCents: Cents
  occurredOn: IsoDate
  note: string | null
  status: RowStatus
  voidedAt: string | null
  sharedExpenseId: string | null
  /** Statement of a card charge (its closing date); null for anything else. */
  statementClosingOn: IsoDate | null
  /** Installment of a purchase in cuotas: plan, number and total. All null for ordinary movements. */
  installmentPlanId: string | null
  installmentNumber: number | null
  installmentsTotal: number | null
  createdAt: string
}

export interface Transfer {
  id: string
  fromAccountId: string
  toAccountId: string
  amountCents: Cents
  occurredOn: IsoDate
  note: string | null
  status: RowStatus
  voidedAt: string | null
  createdAt: string
}

const amountField = z.string().transform((value, ctx) => {
  const cents = parseAmountInput(value)
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Ingresá un monto mayor a cero.' })
    return z.NEVER
  }
  return cents
})

const dateField = z.string().refine(isIsoDate, 'Elegí una fecha válida.')

const noteField = z
  .string()
  .trim()
  .max(200, 'La nota puede tener hasta 200 caracteres.')
  .optional()
  .transform((value) => (value ? value : null))

export const transactionFormSchema = z.object({
  kind: z.enum(['expense', 'income']),
  accountId: z.string().uuid('Elegí una cuenta.'),
  categoryId: z.string().uuid('Elegí una categoría.'),
  amount: amountField,
  occurredOn: dateField,
  note: noteField,
})

export type TransactionFormInput = z.input<typeof transactionFormSchema>
/** Parsed form: `amount` is integer cents and an empty note is `null`. */
export type TransactionFormValues = z.output<typeof transactionFormSchema>

export const transferFormSchema = z
  .object({
    fromAccountId: z.string().uuid('Elegí la cuenta de origen.'),
    toAccountId: z.string().uuid('Elegí la cuenta de destino.'),
    amount: amountField,
    occurredOn: dateField,
    note: noteField,
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: 'El origen y el destino deben ser cuentas distintas.',
    path: ['toAccountId'],
  })

export type TransferFormInput = z.input<typeof transferFormSchema>
export type TransferFormValues = z.output<typeof transferFormSchema>

/** Only posted expense/income feed statistics; transfers and shared-expense kinds never do. */
export function countsInStatistics(tx: Pick<Transaction, 'kind' | 'status'>): boolean {
  return tx.status === 'posted' && (tx.kind === 'expense' || tx.kind === 'income')
}

/** Income positive, expense negative; 0 for anything that does not count in statistics. */
export function signedAmount(tx: Transaction): Cents {
  if (!countsInStatistics(tx)) return 0
  return tx.kind === 'income' ? tx.amountCents : -tx.amountCents
}

/** Kinds that put money into the account; every other kind takes it out. Same rule as `account_balances`. */
export function addsToBalance(kind: string): boolean {
  return kind === 'income' || kind === 'settlement_in' || kind === 'adjustment_in'
}

/** Corrections of an account balance. They move the balance but are never income or expense. */
export function isAdjustment(kind: string): boolean {
  return kind === 'adjustment_in' || kind === 'adjustment_out'
}

/**
 * A card installment whose statement has not closed yet: part of the debt and of its month's report,
 * but not an expense that already happened.
 */
export function isScheduled(
  tx: Pick<Transaction, 'installmentPlanId' | 'occurredOn' | 'status'>,
  today: IsoDate,
): boolean {
  return tx.installmentPlanId !== null && tx.status === 'posted' && tx.occurredOn > today
}
