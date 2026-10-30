import { onlineManager, useMutation } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toUserMessage } from './errors'
import { assertOnline, OFFLINE_MESSAGE, OfflineError } from './offline'
import { createAppQueryClient } from './queryClient'

describe('offline write guard', () => {
  afterEach(() => act(() => onlineManager.setOnline(true)))

  it('assertOnline throws OfflineError only while offline', () => {
    expect(() => assertOnline()).not.toThrow()
    onlineManager.setOnline(false)
    expect(() => assertOnline()).toThrow(OfflineError)
  })

  it('maps OfflineError to the Spanish notice', () => {
    expect(toUserMessage(new OfflineError())).toBe('Sin conexión. Conectate para guardar cambios.')
    expect(OFFLINE_MESSAGE).toBe(toUserMessage(new OfflineError()))
  })

  it('rejects every mutation before running its function and never queues it', async () => {
    const client = createAppQueryClient()
    const mutationFn = vi.fn().mockResolvedValue('saved')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useMutation({ mutationFn }), { wrapper })

    onlineManager.setOnline(false)
    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toBeInstanceOf(OfflineError)
    })
    expect(mutationFn).not.toHaveBeenCalled()
    expect(result.current.isPaused).toBe(false)
    expect(client.getMutationCache().getAll()[0]?.state.status).toBe('error')

    // Back online nothing is replayed: the user has to save again on purpose.
    act(() => onlineManager.setOnline(true))
    expect(mutationFn).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.mutateAsync(undefined)
    })
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })

  it('configures mutations not to pause and queries to serve the cache first', () => {
    const defaults = createAppQueryClient().getDefaultOptions()
    expect(defaults.mutations?.networkMode).toBe('always')
    expect(defaults.queries?.networkMode).toBe('offlineFirst')
    expect(defaults.queries?.gcTime).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
