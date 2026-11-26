import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { usePlus } from '@/features/plus/api/usePlus'
import type { PlusFeature } from '@/features/plus/domain/entitlements'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'

/**
 * A screen that is only for Moni Plus. A Free person who reaches it by any road (a saved link, the address bar) never sees its
 * content: they get the Moni Plus promo for that capability, and closing it takes them back to Explorar. While the plan is still being
 * read a loader shows (never the content). If the plan could not be read (offline) the screen is let through: it is only UX, the server
 * decides what data a Free person gets.
 */
export function PlusRoute({ feature, children, fallback = '/mas' }: { feature: PlusFeature; children: ReactNode; fallback?: string }) {
  const { isFree, isLoading } = usePlus()
  const navigate = useNavigate()
  if (isLoading) return <FullScreenLoader />
  if (isFree) return <PlusPromoDialog feature={feature} onClose={() => navigate(fallback, { replace: true })} />
  return children
}
