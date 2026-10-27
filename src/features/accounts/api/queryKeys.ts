export const accountKeys = {
  all: (userId: string | undefined) => ['accounts', userId] as const,
  list: (userId: string | undefined, includeArchived: boolean) =>
    ['accounts', userId, 'list', { includeArchived }] as const,
}
