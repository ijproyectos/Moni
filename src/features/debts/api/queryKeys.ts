// Every key starts with the user id so a session change never serves another user's data.
export const debtKeys = {
  all: (userId: string | undefined) => ['debts', userId] as const,
  reports: (userId: string | undefined) => ['debts', userId, 'reports'] as const,
  prefs: (userId: string | undefined) => ['debts', userId, 'prefs'] as const,
  notices: (userId: string | undefined) => ['debts', userId, 'notices'] as const,
}
