import { lazy, Suspense } from 'react'

const PlusThanksPage = lazy(() =>
  import('@/features/plus/ui/PlusThanksPage').then((module) => ({
    default: module.PlusThanksPage,
  })),
)

/** Lazy wrapper for the Mercado Pago return page: it is only opened once, right after paying. */
export function PlusThanksRoute() {
  return (
    <Suspense fallback={null}>
      <PlusThanksPage />
    </Suspense>
  )
}
