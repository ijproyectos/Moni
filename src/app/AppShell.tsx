import { Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useSyncFixedExpenses } from '@/features/fixedExpenses/api/useFixedExpenses'
import { useSyncDueSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { MyInitialContext } from '@/shared/ui/myInitialContext'
import { MovementSheetProvider } from '@/features/transactions/ui/MovementSheetProvider'
import { QuickAdd } from '@/features/transactions/ui/QuickAdd'
import { BottomNav } from '@/shared/ui/BottomNav'
import { OfflineBanner } from '@/shared/ui/OfflineBanner'

/** The bottom bar only lives on the four main tabs; inner screens are full height (designs/). */
const TAB_PATHS = ['/', '/actividad', '/grupos', '/mas']

function ShellBottomBar() {
  const { pathname: path } = useLocation()
  if (!TAB_PATHS.includes(path)) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <BottomNav center={<QuickAdd key={path} />} />
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const initial = initialOf(profile?.display_name, user?.email ?? '') || 'V'
  // Safety net for the server job: register what is already due for this person when the app opens.
  useSyncDueSubscriptions()
  // Due fixed expenses become pending bills (nothing is charged or registered by itself).
  useSyncFixedExpenses()
  return (
    <MyInitialContext.Provider value={initial}>
      <MovementSheetProvider>
        <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-canvas">
          <OfflineBanner />
          <main className="pb-32">
            <Outlet />
          </main>
          <ShellBottomBar />
        </div>
      </MovementSheetProvider>
    </MyInitialContext.Provider>
  )
}
