import { Outlet, useMatch } from 'react-router'
import { SharedExpenseSheetProvider } from '@/features/groups/ui/SharedExpenseSheetProvider'
import { useSharedExpenseSheet } from '@/features/groups/ui/sharedExpenseSheetContext'
import { MovementSheetProvider } from '@/features/transactions/ui/MovementSheetProvider'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { BottomNav } from '@/shared/ui/BottomNav'
import { Fab } from '@/shared/ui/Fab'

function ShellFab() {
  const { openNew } = useMovementSheet()
  const { openNewSharedExpense } = useSharedExpenseSheet()
  // On a group screen the one global FAB adds a shared expense to that group.
  const groupMatch = useMatch('/grupos/:id')
  const groupId = groupMatch?.params.id
  return groupId ? (
    <Fab aria-label="Nuevo gasto compartido" onClick={() => openNewSharedExpense(groupId)} />
  ) : (
    <Fab aria-label="Nuevo movimiento" onClick={() => openNew()} />
  )
}

export function AppShell() {
  return (
    <MovementSheetProvider>
      <SharedExpenseSheetProvider>
        <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-canvas">
          <main className="pb-32">
            <Outlet />
          </main>
          <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] items-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <BottomNav />
            <ShellFab />
          </div>
        </div>
      </SharedExpenseSheetProvider>
    </MovementSheetProvider>
  )
}
