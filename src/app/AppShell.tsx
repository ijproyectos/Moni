import { Outlet } from 'react-router'
import { BottomNav } from '@/shared/ui/BottomNav'
import { Fab } from '@/shared/ui/Fab'

export function AppShell() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-canvas">
      <main className="pb-32">
        <Outlet />
      </main>
      <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] items-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <BottomNav />
        {/* New movement flow ships in Sprint 2; the button stays visible but inert until then. */}
        <Fab aria-label="Nuevo movimiento (disponible pronto)" disabled />
      </div>
    </div>
  )
}
