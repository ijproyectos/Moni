// Every key starts with the user id so a session change never serves another user's trips.
export const tripKeys = {
  all: (userId: string | undefined) => ['trips', userId] as const,
  list: (userId: string | undefined) => ['trips', userId, 'list'] as const,
  expenses: (userId: string | undefined) => ['trips', userId, 'expenses'] as const,
  sideExpenses: (userId: string | undefined) => ['trips', userId, 'side-expenses'] as const,
  bookingMovements: (userId: string | undefined) => ['trips', userId, 'booking-movements'] as const,
  bookings: (userId: string | undefined) => ['trips', userId, 'bookings'] as const,
  categories: (userId: string | undefined) => ['trips', userId, 'categories'] as const,
  groupPaid: (userId: string | undefined, groupId: string | undefined) => ['trips', userId, 'group-paid', groupId] as const,
  groupFunding: (userId: string | undefined, groupId: string | undefined) => ['trips', userId, 'group-funding', groupId] as const,
  groupTrips: (userId: string | undefined) => ['trips', userId, 'group-trips'] as const,
}
