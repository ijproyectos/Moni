import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DOLLAR_CARD_KEY, useDollarCardRate } from './useDollarCardRate'

const fetchRate = vi.hoisted(() => vi.fn())
vi.mock('./dollarCardRate', () => ({ fetchDollarCardRate: fetchRate }))

const cached = { sell: 2000, updatedAt: '2026-10-28T18:00:00.000Z' }

function setup() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useDollarCardRate', () => {
  beforeEach(() => {
    fetchRate.mockReset()
  })

  it('serves a fresh cached rate without refetching', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(DOLLAR_CARD_KEY, cached)
    const { result } = renderHook(() => useDollarCardRate(), { wrapper })
    expect(result.current.data).toEqual(cached)
    expect(fetchRate).not.toHaveBeenCalled()
  })

  it('keeps the last rate when a refetch fails', async () => {
    fetchRate.mockImplementation(() => Promise.reject(new Error('offline')))
    const { client, wrapper } = setup()
    client.setQueryData(DOLLAR_CARD_KEY, cached, { updatedAt: Date.now() - 60 * 60 * 1000 })
    const { result } = renderHook(() => useDollarCardRate(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toEqual(cached)
  })

  it('has no data when there is nothing cached and the fetch fails, and does not fetch if disabled', async () => {
    fetchRate.mockImplementation(() => Promise.reject(new Error('offline')))
    const { wrapper } = setup()
    const { result } = renderHook(() => useDollarCardRate(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    fetchRate.mockClear()
    renderHook(() => useDollarCardRate(false), { wrapper: setup().wrapper })
    expect(fetchRate).not.toHaveBeenCalled()
  })
})
