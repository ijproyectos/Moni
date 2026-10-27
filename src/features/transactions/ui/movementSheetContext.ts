import { createContext, useContext } from 'react'
import type { Transaction } from '../domain/transaction'

export type SheetMode = 'expense' | 'income' | 'transfer'

export interface MovementSheetApi {
  /** Opens the "Nuevo movimiento" sheet, optionally on a given tab. */
  openNew: (mode?: SheetMode) => void
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
