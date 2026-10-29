export const dashboardKeys = {
  all: (userId: string | undefined) => ['dashboard', userId] as const,
  monthSummary: (userId: string | undefined, month: string) =>
    ['dashboard', userId, 'month-summary', month] as const,
}

/** Summary of an arbitrary date range (from inclusive, to exclusive). Weekly digest and future reports. */
export const periodKey = (userId: string | undefined, from: string, to: string) =>
  ['dashboard', userId, 'period', from, to] as const
