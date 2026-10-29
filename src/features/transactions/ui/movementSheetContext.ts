import { createContext, useContext } from 'react'
import type { Transaction } from '../domain/transaction'

export type SheetMode = 'expense' | 'income' | 'transfer'

export interface MovementSheetApi {
  /**
   * Opens the "Nuevo movimiento" sheet, optionally on a given tab. `toAccountId` preselects the
   * destination of a transfer (e.g. paying a credit card) and `amountCents` its amount.
   */
  openNew: (mode?: SheetMode, options?: { toAccountId?: string; amountCents?: number }) => void
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
