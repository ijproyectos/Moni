import { renderHook } from '@testing-library/react'
import { makeGoal, makeSavings } from '../domain/testing'
import { useGoalNames } from './useSavings'

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
const overview = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: () => ({ data: overview.current }), useQueryClient: () => ({}) }
})

describe('useGoalNames (what Aguinaldo reads)', () => {
  it('gives the active real goals as names and progress, without touching their reserves', () => {
    overview.current = makeSavings({
      goals: [
        makeGoal({ id: 'a', name: 'Viaje', reservedCents: 10_000_00, targetCents: 100_000_00 }),
        makeGoal({ id: 'b', name: 'Pausada', status: 'paused' }),
        makeGoal({ id: 'c', name: 'Archivada', status: 'archived' }),
      ],
    })
    const { result } = renderHook(() => useGoalNames())
    expect(result.current).toEqual([
      { id: 'a', name: 'Viaje', targetCents: 100_000_00, savedCents: 10_000_00, shared: undefined },
    ])
  })
  it('is empty while loading', () => {
    overview.current = undefined
    expect(renderHook(() => useGoalNames()).result.current).toEqual([])
  })
})
