import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { ahorroKeys } from '@/features/ahorros/api/useAhorros'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import { groupKeys } from '@/features/groups/api/queryKeys'
import { transactionKeys } from '@/features/transactions/api/queryKeys'
import type { BookingFormValues } from '../domain/bookings'
import type { FundingChoice } from '../domain/trip'
import type { TripFormValues } from '../domain/trip'
import { tripKeys } from './queryKeys'
import {
  addTripExpense,
  archiveTrip,
  createBooking,
  createTrip,
  createTripCategory,
  deleteBooking,
  fundSharedPaymentFromSavings,
  getMyGroupFunding,
  linkMovementToBooking,
  linkSharedExpenseToBooking,
  listBookingMovements,
  listBookings,
  listGroupBookingPaid,
  listSideExpenses,
  listTripCategories,
  setBookingCancelled,
  setTripExpenseRate,
  setMyGroupFunding,
  updateBooking,
  voidSideExpense,
  type BookingTarget,
  type NewTripExpense,
  listGroupTrips,
  listTripExpenses,
  listTrips,
  setGroupTrip,
  setTripIcon,
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

export function useSetTripIcon() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, icon }: { id: string; icon: string | null }) => setTripIcon(id, icon),
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

export function useSideExpenses() {
  const { user } = useAuth()
  return useQuery({ queryKey: tripKeys.sideExpenses(user?.id), enabled: Boolean(user), queryFn: listSideExpenses, retry: false })
}

/** My expenses that are payments of a booking (to know what each booking has collected). */
export function useBookingMovements() {
  const { user } = useAuth()
  return useQuery({ queryKey: tripKeys.bookingMovements(user?.id), enabled: Boolean(user), queryFn: listBookingMovements, retry: false })
}

export function useBookings() {
  const { user } = useAuth()
  return useQuery({ queryKey: tripKeys.bookings(user?.id), enabled: Boolean(user), queryFn: listBookings, retry: false })
}

export function useTripCategories() {
  const { user } = useAuth()
  return useQuery({ queryKey: tripKeys.categories(user?.id), enabled: Boolean(user), queryFn: listTripCategories, retry: false })
}

/** What each shared booking of a group has collected. */
export function useGroupBookingPaid(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: tripKeys.groupPaid(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => listGroupBookingPaid(groupId as string),
    retry: false,
  })
}

export function useMyGroupFunding(groupId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: tripKeys.groupFunding(user?.id, groupId),
    enabled: Boolean(user && groupId),
    queryFn: () => getMyGroupFunding(groupId as string),
    retry: false,
  })
}

/** Everything an expense can touch: the trip, movements, accounts, savings and the home figures. */
function useRefreshTripMoney() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: ahorroKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['savings', user?.id] }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: groupKeys.all(user?.id) }),
    ])
}

export function useAddTripExpense() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: (v: NewTripExpense) => addTripExpense(v), onSuccess: refresh })
}

export function useVoidSideExpense() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: (id: string) => voidSideExpense(id), onSuccess: refresh })
}

export function useCreateBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({
    mutationFn: ({ target, values }: { target: BookingTarget; values: BookingFormValues }) => createBooking(target, values),
    onSuccess: refresh,
  })
}

export function useUpdateBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: ({ id, values }: { id: string; values: BookingFormValues }) => updateBooking(id, values), onSuccess: refresh })
}

export function useCancelBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: ({ id, cancelled }: { id: string; cancelled: boolean }) => setBookingCancelled(id, cancelled), onSuccess: refresh })
}

export function useDeleteBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: (id: string) => deleteBooking(id), onSuccess: refresh })
}

export function useLinkMovementToBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({
    mutationFn: ({ transactionId, bookingId, tripId }: { transactionId: string; bookingId: string | null; tripId?: string }) =>
      linkMovementToBooking(transactionId, bookingId, tripId),
    onSuccess: refresh,
  })
}

export function useLinkSharedExpenseToBooking() {
  const refresh = useRefreshTripMoney()
  return useMutation({
    mutationFn: ({ expenseId, bookingId }: { expenseId: string; bookingId: string | null }) => linkSharedExpenseToBooking(expenseId, bookingId),
    onSuccess: refresh,
  })
}

export function useCreateTripCategory() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string }) => createTripCategory(name, icon),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.categories(user?.id) }),
  })
}

export function useSetMyGroupFunding() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ groupId, funding }: { groupId: string; funding: FundingChoice }) => setMyGroupFunding(groupId, funding),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
  })
}

/** Called after a shared expense is saved from a funding choice of «Mis ahorros». */
export function useFundSharedPaymentFromSavings() {
  const refresh = useRefreshTripMoney()
  return useMutation({ mutationFn: (expenseId: string) => fundSharedPaymentFromSavings(expenseId), onSuccess: refresh })
}

export function useSetTripExpenseRate() {
  const refresh = useRefreshTripMoney()
  return useMutation({
    mutationFn: ({ kind, id, rate }: { kind: 'transaction' | 'side'; id: string; rate: number }) => setTripExpenseRate(kind, id, rate),
    onSuccess: refresh,
  })
}

export function useArchiveTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (id: string) => archiveTrip(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.all(user?.id) }),
  })
}
