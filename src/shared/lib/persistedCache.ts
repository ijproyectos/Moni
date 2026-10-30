import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'

const KEY_PREFIX = 'moni-query-cache:'

/** Minimal async key-value contract; IndexedDB in the browser, a Map in tests. */
export interface CacheStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

/** IndexedDB-backed storage. The store opens lazily, so environments without IndexedDB (jsdom) never touch it. */
export function createIdbStorage(): CacheStorage {
  let store: UseStore | undefined
  const open = () => (store ??= createStore('moni-cache', 'queries'))
  return {
    get: (key) => get(key, open()),
    set: (key, value) => set(key, value, open()),
    del: (key) => del(key, open()),
    keys: async () => (await keys(open())).filter((k): k is string => typeof k === 'string'),
  }
}

let storage: CacheStorage = createIdbStorage()

/** Test seam: swap the storage backend. Returns the previous one. */
export function setCacheStorage(next: CacheStorage): CacheStorage {
  const previous = storage
  storage = next
  return previous
}

interface StoredEntry {
  userId: string
  client: PersistedClient
}

export interface UserPersister extends Persister {
  /** Stop writing for good (the user left); late throttled saves are dropped. */
  dispose(): void
  /** Re-enable writes (React StrictMode runs effect cleanups and then the effect again). */
  activate(): void
}

const noop = async () => undefined

/**
 * Persister scoped to one user: the storage key carries the user id and the stored entry is
 * re-checked on restore. With no user it never reads or writes anything. Every storage failure
 * (quota, private mode, no IndexedDB) degrades to "no persistence" instead of throwing.
 */
export function createUserPersister(userId: string | null): UserPersister {
  let active = true
  if (userId === null) {
    return {
      persistClient: noop,
      restoreClient: noop,
      removeClient: noop,
      dispose: noop,
      activate: noop,
    } as UserPersister
  }
  const key = `${KEY_PREFIX}${userId}`
  return {
    async persistClient(client) {
      if (!active) return
      try {
        await storage.set(key, { userId, client } satisfies StoredEntry)
      } catch {
        // Storage unavailable or full: the app keeps working from memory.
      }
    },
    async restoreClient() {
      try {
        const entry = (await storage.get(key)) as StoredEntry | undefined
        if (!entry || entry.userId !== userId) return undefined
        return entry.client
      } catch {
        return undefined
      }
    },
    async removeClient() {
      try {
        await storage.del(key)
      } catch {
        // Nothing to remove if storage is unavailable.
      }
    },
    dispose() {
      active = false
    },
    activate() {
      active = true
    },
  }
}

/** Removes the persisted cache of every user (sign-out, account switch). Never throws. */
export async function clearPersistedCache(): Promise<void> {
  try {
    const all = await storage.keys()
    await Promise.all(all.filter((k) => k.startsWith(KEY_PREFIX)).map((k) => storage.del(k)))
  } catch {
    // Nothing persisted, or storage unavailable.
  }
}
