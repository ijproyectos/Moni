import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { groupKeys } from '@/features/groups/api/queryKeys'
import type { TripFormValues } from '../domain/trip'
import { tripKeys } from './queryKeys'
import {
  createTrip,
  listGroupTrips,
  listTripExpenses,
  listTrips,
  setGroupTrip,
  updateTrip,
} from './tripsRepository'

export function useTrips() {
  const { user } = useAuth()
  return useQuery({
    queryKey: tripKeys.list(user?.id),
    enabled: Boolean(user),
    queryFn: listTrips,
    retry: false,
  })
}

/** All the expenses that belong to the person's trips; each trip filters its own. */
export function useTripExpenses() {
  const { user } = useAuth()
  return useQuery({
    queryKey: tripKeys.expenses(user?.id),
    enabled: Boolean(user),
    queryFn: listTripExpenses,
    retry: false,
  })
}

export function useGroupTrips() {
  const { user } = useAuth()
  return useQuery({
    queryKey: tripKeys.groupTrips(user?.id),
    enabled: Boolean(user),
    queryFn: listGroupTrips,
    retry: false,
  })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (values: TripFormValues) => createTrip(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
  })
}

export function useUpdateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: TripFormValues }) => updateTrip(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
  })
}

export function useSetGroupTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ groupId, values }: { groupId: string; values: Omit<TripFormValues, 'name'> }) =>
      setGroupTrip(groupId, values),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.all(user?.id) }),
      ]),
  })
}
