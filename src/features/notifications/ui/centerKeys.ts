export const centerKeys = {
  reads: (userId: string | undefined) => ['notice-center', userId, 'reads'] as const,
  prefs: (userId: string | undefined) => ['notice-center', userId, 'prefs'] as const,
}
