import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { OfflineError } from '@/shared/lib/offline'
import { useAssistantChat } from './useAssistantChat'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, networkMode: 'always' } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

describe('useAssistantChat', () => {
  beforeEach(() => invoke.mockReset())

  it('sends the conversation and appends the reply', async () => {
    invoke.mockResolvedValue({ data: { reply: 'Gastaste $1.000' }, error: null })
    const { result } = renderHook(() => useAssistantChat(), { wrapper })
    act(() => void result.current.send('  ¿Cuánto gasté?  '))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(invoke).toHaveBeenCalledWith('insights-chat', {
      body: { messages: [{ role: 'user', content: '¿Cuánto gasté?' }] },
    })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: 'Gastaste $1.000' })
  })

  it('ignores blank text', () => {
    const { result } = renderHook(() => useAssistantChat(), { wrapper })
    act(() => void result.current.send('   '))
    expect(invoke).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it('maps HTTP 402 to plusRequired', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(402, { error: 'plus_required' }) })
    const { result } = renderHook(() => useAssistantChat(), { wrapper })
    act(() => void result.current.send('hola'))
    await waitFor(() => expect(result.current.plusRequired).toBe(true))
  })

  it('keeps the question after a failure and retries it', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(502, { error: 'ai_unavailable' }) })
    const { result } = renderHook(() => useAssistantChat(), { wrapper })
    act(() => void result.current.send('hola'))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.messages).toHaveLength(1)
    invoke.mockResolvedValueOnce({ data: { reply: 'Hola!' }, error: null })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('fails with OfflineError before any request when offline', async () => {
    const { onlineManager } = await import('@tanstack/react-query')
    onlineManager.setOnline(false)
    try {
      const { result } = renderHook(() => useAssistantChat(), { wrapper })
      act(() => void result.current.send('hola'))
      await waitFor(() => expect(result.current.error).toBeInstanceOf(OfflineError))
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      onlineManager.setOnline(true)
    }
  })
})
