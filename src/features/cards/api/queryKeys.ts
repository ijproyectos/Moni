// All card queries live under ['accounts', userId, ...]: any money movement already invalidates
// accountKeys.all, so overviews, statements and plans refresh together with balances.
export const cardKeys = {
  overview: (userId: string | undefined, accountId: string) =>
    ['accounts', userId, 'card', accountId, 'overview'] as const,
  statementItems: (userId: string | undefined, accountId: string, closingOn: string) =>
    ['accounts', userId, 'card', accountId, 'statement', closingOn] as const,
  plans: (userId: string | undefined) => ['accounts', userId, 'installment-plans'] as const,
}
