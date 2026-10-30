// Every key starts with the user id so a session change never serves another user's trips.
export const tripKeys = {
  all: (userId: string | undefined) => ['trips', userId] as const,
  list: (userId: string | undefined) => ['trips', userId, 'list'] as const,
  expenses: (userId: string | undefined) => ['trips', userId, 'expenses'] as const,
  groupTrips: (userId: string | undefined) => ['trips', userId, 'group-trips'] as const,
}
