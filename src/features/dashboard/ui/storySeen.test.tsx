import { act, renderHook } from '@testing-library/react'
import type { Story } from '../domain/stories'
import { useStorySeen } from './storySeen'

const story = (signature = 'a'): Story => ({
  id: 'cobros',
  signature,
  label: 'Cobros',
  bubble: '2',
  tone: 'green',
  priority: 2,
  slides: [],
})

beforeEach(() => window.localStorage.clear())

describe('useStorySeen', () => {
  it('a story is new until it is marked, and stays seen after a reload', () => {
    const first = renderHook(() => useStorySeen('u1'))
    expect(first.result.current.isSeen(story())).toBe(false)
    act(() => first.result.current.markSeen(story()))
    expect(first.result.current.isSeen(story())).toBe(true)
    first.unmount()
    expect(renderHook(() => useStorySeen('u1')).result.current.isSeen(story())).toBe(true)
  })

  it('comes back as new when its news change', () => {
    const { result } = renderHook(() => useStorySeen('u1'))
    act(() => result.current.markSeen(story('a')))
    expect(result.current.isSeen(story('b'))).toBe(false)
  })

  it('is kept per person', () => {
    const one = renderHook(() => useStorySeen('u1'))
    act(() => one.result.current.markSeen(story()))
    expect(renderHook(() => useStorySeen('u2')).result.current.isSeen(story())).toBe(false)
  })

  it('works when the storage is not available', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useStorySeen('u1'))
    act(() => result.current.markSeen(story()))
    expect(result.current.isSeen(story())).toBe(true)
    spy.mockRestore()
  })
})
