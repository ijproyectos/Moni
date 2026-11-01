import { lazy, Suspense } from 'react'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'

// Everything admin lives in this lazy chunk: regular users never download it.
const AdminApp = lazy(() =>
  import('@/features/admin/ui/AdminApp').then((module) => ({ default: module.AdminApp })),
)

export function AdminRoute() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminApp />
    </Suspense>
  )
}
