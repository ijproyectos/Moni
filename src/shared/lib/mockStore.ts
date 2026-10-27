import { useSyncExternalStore } from 'react'

/**
 * In-memory store for simulated features (metas, viajes, avisos…) that have no backend yet.
 * State lives only for the browser session and never touches Supabase.
 */
export interface MockStore<T> {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

export function createMockStore<T>(initial: T): MockStore<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useMockStore<T>(store: MockStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Short id for records created in simulated stores. */
export function mockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
