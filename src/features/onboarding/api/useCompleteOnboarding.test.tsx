import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { loadLocalPreferences } from '../domain/localPreferences'
import { useCompleteOnboarding } from './useCompleteOnboarding'

const rpc = vi.hoisted(() => vi.fn())
const createCategory = vi.hoisted(() => vi.fn())

vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))
vi.mock('@/features/categories/api/categoriesRepository', () => ({ createCategory }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const input = {
  goals: ['track_spending'],
  templateSlugs: ['comida'],
  customCategories: [
    { kind: 'expense' as const, name: 'Gimnasio', icon: 'Dumbbell', color: '#2F9E8F' },
  ],
  secondaryCurrency: 'USD' as const,
  notificationsOptIn: true,
}

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCompleteOnboarding(), { wrapper }).result
}

describe('useCompleteOnboarding', () => {
  beforeEach(() => {
    rpc.mockReset()
    createCategory.mockReset()
    window.localStorage.clear()
  })

  it('saves everything atomically with complete_onboarding_v2 when available', async () => {
    rpc.mockResolvedValue({ error: null })
    const result = setup()
    await act(() => result.current.mutateAsync(input))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('complete_onboarding_v2', {
      p_goals: ['track_spending'],
      p_template_slugs: ['comida'],
      p_custom_categories: input.customCategories,
      p_secondary_currency: 'USD',
      p_notifications_opt_in: true,
    })
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('falls back to the current RPC and keeps preferences locally while the migration is pending', async () => {
    rpc
      .mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'not found' } })
      .mockResolvedValueOnce({ error: null })
    createCategory.mockResolvedValue(undefined)
    const result = setup()
    await act(() => result.current.mutateAsync(input))
    expect(createCategory).toHaveBeenCalledWith(input.customCategories[0])
    expect(rpc).toHaveBeenLastCalledWith('complete_onboarding', {
      p_goals: ['track_spending'],
      p_template_slugs: ['comida'],
    })
    expect(loadLocalPreferences('u1')).toEqual({
      secondaryCurrency: 'USD',
      notificationsOptIn: true,
    })
  })

  it('surfaces real errors instead of falling back', async () => {
    rpc.mockResolvedValue({ error: { code: '22023', message: 'no_categories' } })
    const result = setup()
    await expect(act(() => result.current.mutateAsync(input))).rejects.toBeTruthy()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('rejects an onboarding without categories before calling the server', async () => {
    const result = setup()
    await expect(
      act(() => result.current.mutateAsync({ ...input, templateSlugs: [], customCategories: [] })),
    ).rejects.toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })
})
