import { Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useSyncFixedExpenses } from '@/features/fixedExpenses/api/useFixedExpenses'
import { useSyncDueSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { RewardCelebration } from '@/features/goals/ui/RewardCelebration'
import { PushEnrollmentPrompt } from '@/features/push/ui/PushEnrollmentPrompt'
import { MyInitialContext } from '@/shared/ui/myInitialContext'
import { MovementSheetProvider } from '@/features/transactions/ui/MovementSheetProvider'
import { BottomNav } from '@/shared/ui/BottomNav'
import { OfflineBanner } from '@/shared/ui/OfflineBanner'
import { useKeyboardOpen } from '@/shared/ui/useKeyboardOpen'

/** The bottom bar only lives on the main tabs; inner screens are full height (designs/). */
const TAB_PATHS = ['/', '/actividad', '/grupos', '/cuentas', '/mas', '/perfil', '/perfil/configuracion']

export function ShellBottomBar() {
  const { pathname: path } = useLocation()
  const keyboardOpen = useKeyboardOpen()
  if (!TAB_PATHS.includes(path) || keyboardOpen) return null
  return (
    // In the flow, after <main>: `sticky bottom-0` floats it over the content while scrolling, and at the end of the page it
    // rests in its own place, so the content always ends above it (no padding to guess, nothing can hide behind it).
    <div data-bottom-action className="pointer-events-none sticky bottom-0 z-30 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <BottomNav />
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const initial = initialOf(profile?.display_name, user?.email ?? '') || 'V'
  const { pathname } = useLocation()
  // The bottom bar is in the flow (sticky), so it brings its own room; tab pages only need a small gap above it.
  const bottomRoom = TAB_PATHS.includes(pathname) ? 'pb-4' : 'pb-10'
  // Safety net for the server job: register what is already due for this person when the app opens.
  useSyncDueSubscriptions()
  // Due fixed expenses become pending bills (nothing is charged or registered by itself).
  useSyncFixedExpenses()
  return (
    <MyInitialContext.Provider value={initial}>
      <MovementSheetProvider>
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas">
          <OfflineBanner />
          <main className={`flex-1 ${bottomRoom}`}>
            <Outlet />
          </main>
          <ShellBottomBar />
          <RewardCelebration />
          <PushEnrollmentPrompt />
        </div>
      </MovementSheetProvider>
    </MyInitialContext.Provider>
  )
}
