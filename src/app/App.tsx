import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/features/auth/api/AuthProvider'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { ToastProvider } from '@/shared/ui/Toast'
import { router } from './router'

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HiddenAmountsProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </HiddenAmountsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
