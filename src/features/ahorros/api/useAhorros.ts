import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { createAhorro, listAhorros, voidAhorro, type NewAhorro } from './ahorrosRepository'

export const ahorroKeys = {
  all: (userId: string | undefined) => ['ahorros', userId] as const,
  list: (userId: string | undefined) => ['ahorros', userId, 'list'] as const,
}

export function useAhorros() {
  const { user } = useAuth()
  return useQuery({ queryKey: ahorroKeys.list(user?.id), enabled: Boolean(user), queryFn: listAhorros, retry: false })
}

function useRefresh() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // A deposit from an account changes how much of it is free: what the goals read about its accounts is refreshed too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ahorroKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['savings', user?.id] }),
    ])
}

export function useCreateAhorro() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (values: NewAhorro) => createAhorro(values), onSuccess: refresh })
}

export function useVoidAhorro() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => voidAhorro(id), onSuccess: refresh })
}
