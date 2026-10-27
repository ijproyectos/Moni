import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import type { AccountKind } from '@/shared/lib/database.types'
import type { Cents } from '@/shared/lib/money'

export const ACCOUNT_KINDS: readonly AccountKind[] = ['cash', 'bank', 'wallet']

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera virtual',
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
}

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Ponele un nombre a la cuenta.').max(40, 'Máximo 40 caracteres.'),
  kind: z.enum(['cash', 'bank', 'wallet'], { message: 'Elegí un tipo de cuenta.' }),
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
})

export type AccountFormInput = z.input<typeof accountFormSchema>
/** Parsed form: `openingBalance` is integer cents. */
export type AccountFormValues = z.output<typeof accountFormSchema>

/** Sum of the balances that make up "saldo disponible": active accounts only. */
export function availableBalance(accounts: readonly Account[]): Cents {
  return accounts.reduce((sum, a) => (a.archivedAt === null ? sum + a.balanceCents : sum), 0)
}
