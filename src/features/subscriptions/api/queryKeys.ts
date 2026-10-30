export const subscriptionKeys = {
  all: (userId: string | undefined) => ['subscriptions', userId] as const,
  overview: (userId: string | undefined) => ['subscriptions', userId, 'overview'] as const,
}
