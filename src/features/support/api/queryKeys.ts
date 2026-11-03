// Every key starts with the user id so a session change never serves another person's tickets.
export const supportKeys = {
  all: (userId: string | undefined) => ['support', userId] as const,
  tickets: (userId: string | undefined) => ['support', userId, 'tickets'] as const,
}
