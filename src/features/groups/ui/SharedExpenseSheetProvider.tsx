import { useMemo, useState, type ReactNode } from 'react'
import { SharedExpenseSheet } from './SharedExpenseSheet'
import { SharedExpenseSheetContext } from './sharedExpenseSheetContext'

/** Owns the "Nuevo gasto compartido" sheet so the global FAB can open it on group screens. */
export function SharedExpenseSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ groupId: string; key: number } | null>(null)

  const api = useMemo(
    () => ({
      openNewSharedExpense: (groupId: string) =>
        setState((current) => ({ groupId, key: (current?.key ?? 0) + 1 })),
    }),
    [],
  )

  return (
    <SharedExpenseSheetContext.Provider value={api}>
      {children}
      {state && (
        <SharedExpenseSheet
          key={state.key}
          groupId={state.groupId}
          onClose={() => setState(null)}
        />
      )}
    </SharedExpenseSheetContext.Provider>
  )
}
