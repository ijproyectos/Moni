import { canCreateMore, isPlusOnly, type LimitedKind, type PlusFeature } from '../domain/entitlements'
import { usePlus } from './usePlus'

export interface PlanAccess {
  isPlus: boolean
  /** The server answered and the person is on Free (false while loading or offline: the screen lets it through, the server decides). */
  isFree: boolean
  /** False only for a Free person and a Plus-only capability. */
  canUse: (feature: PlusFeature) => boolean
  /** False only for a Free person who has already created the free amount in total (any state). */
  canCreate: (kind: LimitedKind, createdCount: number) => boolean
}

/** The one hook every screen asks "can this person use / create this?". Rules live in domain/entitlements.ts. */
export function usePlanAccess(): PlanAccess {
  const { isPlus, isFree } = usePlus()
  return {
    isPlus,
    isFree,
    canUse: (feature) => !(isFree && isPlusOnly(feature)),
    canCreate: (kind, createdCount) => canCreateMore(kind, createdCount, isFree),
  }
}
