export const dashboardKeys = {
  all: (userId: string | undefined) => ['dashboard', userId] as const,
  monthSummary: (userId: string | undefined, month: string) =>
    ['dashboard', userId, 'month-summary', month] as const,
}
