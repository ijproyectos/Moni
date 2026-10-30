import { useMemo, useState, type ReactNode } from 'react'
import type { Transaction } from '../domain/transaction'
import { MovementSheet } from './MovementSheet'
import { MovementSheetContext, type SheetMode } from './movementSheetContext'

type SheetState = {
  mode: SheetMode
  transaction?: Transaction
  toAccountId?: string
  amountCents?: number
  tripId?: string
} | null

/** Owns the "Nuevo movimiento" sheet so the FAB, Actividad and Cuentas can open it from anywhere. */
export function MovementSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SheetState>(null)
  // Remounting per opening resets the forms.
  const [openCount, setOpenCount] = useState(0)

  const api = useMemo(
    () => ({
      openNew: (
        mode: SheetMode = 'expense',
        options?: { toAccountId?: string; amountCents?: number; tripId?: string },
      ) => {
        setOpenCount((n) => n + 1)
        setState({
          mode,
          toAccountId: options?.toAccountId,
          amountCents: options?.amountCents,
          tripId: options?.tripId,
        })
      },
      openEdit: (transaction: Transaction) => {
        setOpenCount((n) => n + 1)
        setState({ mode: transaction.kind === 'income' ? 'income' : 'expense', transaction })
      },
    }),
    [],
  )

  return (
    <MovementSheetContext.Provider value={api}>
      {children}
      {state && (
        <MovementSheet
          key={openCount}
          initialMode={state.mode}
          transaction={state.transaction}
          transferTo={state.toAccountId}
          transferAmountCents={state.amountCents}
          tripId={state.tripId}
          onClose={() => setState(null)}
        />
      )}
    </MovementSheetContext.Provider>
  )
}
