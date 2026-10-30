import { onlineManager } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  afterEach(() => act(() => onlineManager.setOnline(true)))

  it('starts online', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('follows the window offline and online events', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('follows TanStack onlineManager changes', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => onlineManager.setOnline(false))
    expect(result.current).toBe(false)
  })
})
