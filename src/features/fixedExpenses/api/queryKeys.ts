export const fixedKeys = {
  all: (userId: string | undefined) => ['fixed-expenses', userId] as const,
  overview: (userId: string | undefined) => ['fixed-expenses', userId, 'overview'] as const,
  duplicates: (
    userId: string | undefined,
    occurrenceId: string,
    amountCents: number,
    paidOn: string,
    accountId: string,
  ) =>
    ['fixed-expenses', userId, 'duplicates', occurrenceId, amountCents, paidOn, accountId] as const,
}
