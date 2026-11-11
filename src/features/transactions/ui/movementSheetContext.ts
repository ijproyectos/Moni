import { createContext, useContext } from 'react'
import type { Transaction } from '../domain/transaction'

export type SheetMode = 'expense' | 'income' | 'transfer'

/** Values a new expense starts with (e.g. "Repetir uno reciente"). */
export interface MovementPrefill {
  amountCents?: number
  categoryId?: string | null
  accountId?: string
  note?: string | null
}

export interface NewMovementOptions {
  toAccountId?: string
  amountCents?: number
  tripId?: string
  /** Prefills the expense / income form (the amount, category, account and note). */
  initial?: MovementPrefill
  /** Opens the expense already set to "Dividir con un grupo". */
  shared?: boolean
}

export interface MovementSheetApi {
  /**
   * Opens the "Nuevo movimiento" sheet, optionally on a given tab. `toAccountId` preselects the
   * destination of a transfer (e.g. paying a credit card) and `amountCents` its amount. `tripId` makes the new
   * expense belong to one of the person's trips (it is still an ordinary movement).
   */
  openNew: (mode?: SheetMode, options?: NewMovementOptions) => void
  /** Opens the sheet in edit mode: prefilled, kind locked. */
  openEdit: (transaction: Transaction) => void
}

export const MovementSheetContext = createContext<MovementSheetApi>({
  openNew: () => undefined,
  openEdit: () => undefined,
})

export function useMovementSheet(): MovementSheetApi {
  return useContext(MovementSheetContext)
}
