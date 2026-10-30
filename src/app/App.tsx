import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/features/auth/api/AuthProvider'
import { UserDataGuard } from '@/features/auth/api/UserDataGuard'
import { syncInitialOnlineState } from '@/shared/lib/offline'
import { createAppQueryClient } from '@/shared/lib/queryClient'
import { UpdatePrompt } from '@/shared/pwa/UpdatePrompt'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { ToastProvider } from '@/shared/ui/Toast'
import { PersistedQueryProvider } from './PersistedQueryProvider'
import { router } from './router'

export function App() {
  const [queryClient] = useState(() => {
    // A page opened without a connection must know it from the first render.
    syncInitialOnlineState()
    return createAppQueryClient()
  })

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserDataGuard />
        <PersistedQueryProvider client={queryClient}>
          <HiddenAmountsProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </HiddenAmountsProvider>
        </PersistedQueryProvider>
        <UpdatePrompt />
      </AuthProvider>
    </QueryClientProvider>
  )
}
