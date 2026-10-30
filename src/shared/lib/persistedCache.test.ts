import { QueryClient, dehydrate } from '@tanstack/react-query'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import {
  clearPersistedCache,
  createUserPersister,
  setCacheStorage,
  type CacheStorage,
} from './persistedCache'

function memoryStorage(): CacheStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, v),
    del: async (k) => void data.delete(k),
    keys: async () => [...data.keys()],
  }
}

function snapshot(secret: string): PersistedClient {
  const client = new QueryClient()
  client.setQueryData(['accounts'], [{ name: secret }])
  return { timestamp: Date.now(), buster: 'test', clientState: dehydrate(client) }
}

describe('per-user persisted cache', () => {
  let storage: ReturnType<typeof memoryStorage>
  let previous: CacheStorage
  beforeEach(() => {
    storage = memoryStorage()
    previous = setCacheStorage(storage)
  })
  afterEach(() => setCacheStorage(previous))

  it('restores a user own snapshot', async () => {
    const a = createUserPersister('user-a')
    await a.persistClient(snapshot('cuenta de A'))
    expect(await createUserPersister('user-a').restoreClient()).toBeDefined()
  })

  it('never shows user A data to user B', async () => {
    await createUserPersister('user-a').persistClient(snapshot('cuenta de A'))
    expect(await createUserPersister('user-b').restoreClient()).toBeUndefined()
  })

  it('rejects an entry stored under the right key for the wrong user', async () => {
    await createUserPersister('user-a').persistClient(snapshot('cuenta de A'))
    const [[key, entry]] = [...storage.data.entries()] as [[string, unknown]]
    storage.data.set(key.replace('user-a', 'user-b'), entry)
    expect(await createUserPersister('user-b').restoreClient()).toBeUndefined()
  })

  it('wipes every user persisted cache on clear', async () => {
    await createUserPersister('user-a').persistClient(snapshot('A'))
    await createUserPersister('user-b').persistClient(snapshot('B'))
    storage.data.set('unrelated', 1)
    await clearPersistedCache()
    expect([...storage.data.keys()]).toEqual(['unrelated'])
    expect(await createUserPersister('user-a').restoreClient()).toBeUndefined()
  })

  it('persists nothing without an authenticated user', async () => {
    const anonymous = createUserPersister(null)
    await anonymous.persistClient(snapshot('x'))
    expect(storage.data.size).toBe(0)
    expect(await anonymous.restoreClient()).toBeUndefined()
  })

  it('drops late writes after dispose and accepts them again after activate', async () => {
    const persister = createUserPersister('user-a')
    persister.dispose()
    await persister.persistClient(snapshot('late'))
    expect(storage.data.size).toBe(0)
    persister.activate()
    await persister.persistClient(snapshot('now'))
    expect(storage.data.size).toBe(1)
  })

  it('degrades to no persistence when storage throws', async () => {
    const broken: CacheStorage = {
      get: () => Promise.reject(new Error('boom')),
      set: () => Promise.reject(new Error('boom')),
      del: () => Promise.reject(new Error('boom')),
      keys: () => Promise.reject(new Error('boom')),
    }
    setCacheStorage(broken)
    const persister = createUserPersister('user-a')
    await expect(persister.persistClient(snapshot('a'))).resolves.toBeUndefined()
    await expect(persister.restoreClient()).resolves.toBeUndefined()
    await expect(persister.removeClient()).resolves.toBeUndefined()
    await expect(clearPersistedCache()).resolves.toBeUndefined()
  })
})
