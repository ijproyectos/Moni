import { QueryClient, QueryClientProvider, dehydrate, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthContext, type AuthState } from '@/features/auth/api/authContext'
import { clearUserData } from '@/features/auth/api/authActions'
import { UserDataGuard } from '@/features/auth/api/UserDataGuard'
import {
  createUserPersister,
  setCacheStorage,
  type CacheStorage,
} from '@/shared/lib/persistedCache'
import { PersistedQueryProvider } from './PersistedQueryProvider'

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

const authFor = (id: string | null): AuthState => {
  const user = id ? ({ id } as NonNullable<AuthState['user']>) : null
  return {
    user,
    session: user ? ({ user } as NonNullable<AuthState['session']>) : null,
    isLoading: false,
  }
}

function Accounts() {
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => new Promise<string[]>(() => undefined), // never resolves: only the cache can answer
    staleTime: Infinity,
  })
  return <p>{data ? data.join(',') : 'vacío'}</p>
}

async function seed(userId: string, names: string[]) {
  const source = new QueryClient()
  source.setQueryData(['accounts'], names)
  await createUserPersister(userId).persistClient({
    timestamp: Date.now(),
    buster: __APP_VERSION__,
    clientState: dehydrate(source),
  })
}

function tree(client: QueryClient, userId: string | null) {
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={authFor(userId)}>
        <UserDataGuard />
        <PersistedQueryProvider client={client}>
          <Accounts />
        </PersistedQueryProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('PersistedQueryProvider', () => {
  let storage: ReturnType<typeof memoryStorage>
  let previous: CacheStorage
  beforeEach(() => {
    storage = memoryStorage()
    previous = setCacheStorage(storage)
  })
  afterEach(() => setCacheStorage(previous))

  it('restores the persisted cache for the signed-in user', async () => {
    await seed('user-a', ['Cuenta de A'])
    render(tree(new QueryClient(), 'user-a'))
    expect(await screen.findByText('Cuenta de A')).toBeInTheDocument()
  })

  it('does not show user A persisted data to user B', async () => {
    await seed('user-a', ['Cuenta de A'])
    render(tree(new QueryClient(), 'user-b'))
    expect(await screen.findByText('vacío')).toBeInTheDocument()
  })

  it('restores nothing and saves nothing while signed out', async () => {
    await seed('user-a', ['Cuenta de A'])
    const client = new QueryClient()
    render(tree(client, null))
    expect(await screen.findByText('vacío')).toBeInTheDocument()
    client.setQueryData(['accounts'], ['x'])
    await new Promise((r) => setTimeout(r, 1200))
    expect([...storage.data.keys()]).toEqual(['moni-query-cache:user-a'])
  })

  it('wipes the persisted copy on user change and sign-out (clearUserData)', async () => {
    await seed('user-a', ['Cuenta de A'])
    const client = new QueryClient()
    const { rerender } = render(tree(client, 'user-a'))
    await screen.findByText('Cuenta de A')

    rerender(tree(client, 'user-b'))
    await waitFor(() => expect(storage.data.size).toBe(0))
    expect(await screen.findByText('vacío')).toBeInTheDocument()

    await seed('user-b', ['Cuenta de B'])
    clearUserData(client)
    await waitFor(() => expect(storage.data.size).toBe(0))
  })
})
