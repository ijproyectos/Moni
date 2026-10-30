import { renderHook } from '@testing-library/react'
import { useAguinaldo } from '@/features/aguinaldo/mock/aguinaldoStore'
import {
  MOCK_AGUINALDO_ESTIMATE,
  MOCK_PARTNER,
  MOCK_SOURCES,
  MOCK_SPACES,
} from '@/features/goals/mock/goalsStore'
import { DEFAULT_RECURRING, emptyOverlay } from '@/features/groups/mock/overlayStore'
import { useWeeklyDigestSettings } from '@/features/insights/mock/digestSettings'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { useProfileExtras } from '@/features/settings/mock/profileExtrasStore'
import { useTrips } from '@/features/trips/mock/tripsStore'

// Owner order: nothing the person did not enter may reach the screen.
describe('simulated stores start empty', () => {
  it('notifications: no people, debts, activity, unread count or alias', () => {
    const { result } = renderHook(() => useNotifications())
    expect(result.current).toMatchObject({
      toPay: [],
      owedToMe: [],
      activity: [],
      reminders: [],
      unread: 0,
      myAlias: '',
    })
  })

  it('aguinaldo: no amount and no destinations', () => {
    const { result } = renderHook(() => useAguinaldo())
    expect(result.current.amountCents).toBe(0)
    expect(result.current.destinations).toEqual([])
  })

  it('solo trips: none', () => {
    const { result } = renderHook(() => useTrips())
    expect(result.current).toEqual({ solo: [], past: [] })
  })

  it('profile extras: no monthly income nor photo', () => {
    const { result } = renderHook(() => useProfileExtras())
    expect(result.current.monthlyIncomeCents).toBe(0)
    expect(result.current.localPhotoUrl).toBeNull()
  })

  it('weekly digest is off by default', () => {
    const { result } = renderHook(() => useWeeklyDigestSettings())
    expect(result.current.enabled).toBe(false)
  })

  it('goals and groups constants carry no sample values', () => {
    expect(MOCK_AGUINALDO_ESTIMATE).toBe(0)
    expect(MOCK_PARTNER).toBe('')
    expect(MOCK_SPACES).toEqual([])
    expect(MOCK_SOURCES).toEqual([])
    expect(DEFAULT_RECURRING).toEqual([])
    expect(emptyOverlay().recurring).toEqual([])
  })
})
