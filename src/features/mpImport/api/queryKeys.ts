// Every key starts with the user id so a session change never serves another user's connection.
export const mpImportKeys = {
  all: (userId: string | undefined) => ['mp-import', userId] as const,
  connection: (userId: string | undefined) => ['mp-import', userId, 'connection'] as const,
  duplicates: (userId: string | undefined) => ['mp-import', userId, 'duplicates'] as const,
  unimported: (userId: string | undefined) => ['mp-import', userId, 'unimported'] as const,
  suggestions: (userId: string | undefined) => ['mp-import', userId, 'suggestions'] as const,
}
