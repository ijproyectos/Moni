// Every key starts with the user id so a session change never serves another user's plan.
export const plusKeys = {
  all: (userId: string | undefined) => ['plus', userId] as const,
  status: (userId: string | undefined) => ['plus', userId, 'status'] as const,
  subscription: (userId: string | undefined) => ['plus', userId, 'subscription'] as const,
}
