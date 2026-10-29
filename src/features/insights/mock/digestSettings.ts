// Weekly digest preferences (simulated). Scheduling and push notifications are not built yet, so these
// settings only live in memory and are edited from the profile screen.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'

export interface WeeklyDigestSettings {
  enabled: boolean
  day: string
  time: string
  smallLimitCents: Cents
}

const settings = createMockStore<WeeklyDigestSettings>({
  enabled: true,
  day: 'Domingo',
  time: '20:00',
  smallLimitCents: 5_000_00,
})

export function useWeeklyDigestSettings(): WeeklyDigestSettings {
  return useMockStore(settings)
}

export function updateWeeklyDigest(patch: Partial<WeeklyDigestSettings>) {
  settings.set((s) => ({ ...s, ...patch }))
}
