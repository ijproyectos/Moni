// Simulated alias / "para cobrar" settings per account. The accounts table has no alias column yet.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'

export interface AccountAlias {
  alias: string
  forCollecting: boolean
}

const store = createMockStore<Record<string, AccountAlias>>({})

export function useAccountAliases(): Record<string, AccountAlias> {
  return useMockStore(store)
}

export function setAccountAlias(accountId: string, value: AccountAlias) {
  store.set((all) => {
    const next = { ...all, [accountId]: value }
    // Only one account is used to get paid.
    if (value.forCollecting) {
      for (const [id, entry] of Object.entries(next)) {
        if (id !== accountId) next[id] = { ...entry, forCollecting: false }
      }
    }
    return next
  })
}

/** The alias people should transfer to, if any account is marked "para cobrar". */
export function useCollectAlias(): string | null {
  const all = useAccountAliases()
  return Object.values(all).find((a) => a.forCollecting && a.alias)?.alias ?? null
}
