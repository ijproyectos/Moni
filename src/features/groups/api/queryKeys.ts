// Every key starts with the user id so a session change never serves another user's groups.
export const groupKeys = {
  all: (userId: string | undefined) => ['groups', userId] as const,
  list: (userId: string | undefined) => ['groups', userId, 'list'] as const,
  detail: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'detail', groupId] as const,
  members: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'members', groupId] as const,
  balances: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'balances', groupId] as const,
  invites: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'invites', groupId] as const,
  expenses: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'expenses', groupId] as const,
  settlements: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'settlements', groupId] as const,
}
