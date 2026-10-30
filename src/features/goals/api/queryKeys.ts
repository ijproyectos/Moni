export const savingsKeys = {
  all: (userId: string | undefined) => ['savings', userId] as const,
  overview: (userId: string | undefined) => ['savings', userId, 'overview'] as const,
}
