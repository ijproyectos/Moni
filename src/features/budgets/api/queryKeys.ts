// Budget status and suggestions derive from transactions, so they live under the 'dashboard' prefix:
// every transaction/category/group mutation already invalidates dashboardKeys.all and refreshes them too.
export const budgetKeys = {
  status: (userId: string | undefined, month: string) =>
    ['dashboard', userId, 'budget-status', month] as const,
  suggestions: (userId: string | undefined) => ['dashboard', userId, 'budget-suggestions'] as const,
}
