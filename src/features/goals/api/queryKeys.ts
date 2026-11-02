export const savingsKeys = {
  all: (userId: string | undefined) => ['savings', userId] as const,
  overview: (userId: string | undefined) => ['savings', userId, 'overview'] as const,
  plan: (userId: string | undefined) => ['savings', userId, 'plan'] as const,
  rewards: (userId: string | undefined) => ['savings', userId, 'rewards'] as const,
}
