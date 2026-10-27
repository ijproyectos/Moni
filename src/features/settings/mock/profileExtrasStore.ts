// Simulated profile extras: monthly income and a locally chosen photo. In-memory only.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'

interface ProfileExtras {
  monthlyIncomeCents: Cents
  /** Object URL of a photo picked on this device; never uploaded. */
  localPhotoUrl: string | null
  /** True when the person removed their photo (only on this device). */
  photoRemoved: boolean
}

const store = createMockStore<ProfileExtras>({
  monthlyIncomeCents: 1_000_000_00,
  localPhotoUrl: null,
  photoRemoved: false,
})

export function useProfileExtras(): ProfileExtras {
  return useMockStore(store)
}

export function getMonthlyIncome(): Cents {
  return store.get().monthlyIncomeCents
}

export function updateProfileExtras(patch: Partial<ProfileExtras>) {
  store.set((s) => ({ ...s, ...patch }))
}
