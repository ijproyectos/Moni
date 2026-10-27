import { createContext, useContext } from 'react'

export interface SharedExpenseSheetApi {
  /** Opens "Nuevo gasto compartido" for a group (global FAB and the group screen). */
  openNewSharedExpense: (groupId: string) => void
}

export const SharedExpenseSheetContext = createContext<SharedExpenseSheetApi>({
  openNewSharedExpense: () => undefined,
})

export function useSharedExpenseSheet(): SharedExpenseSheetApi {
  return useContext(SharedExpenseSheetContext)
}
