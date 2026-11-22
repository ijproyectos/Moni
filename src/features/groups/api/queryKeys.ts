// Every key starts with the user id so a session change never serves another user's groups.
export const groupKeys = {
  all: (userId: string | undefined) => ['groups', userId] as const,
  list: (userId: string | undefined) => ['groups', userId, 'list'] as const,
  hidden: (userId: string | undefined) => ['groups', userId, 'hidden'] as const,
  contacts: (userId: string | undefined) => ['groups', userId, 'contacts'] as const,
  hiddenContacts: (userId: string | undefined) => ['groups', userId, 'hidden-contacts'] as const,
  myInvitations: (userId: string | undefined) => ['groups', userId, 'my-invitations'] as const,
  invitations: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'invitations', groupId] as const,
  recurring: (userId: string | undefined, groupId: string | undefined) => ['groups', userId, 'recurring', groupId] as const,
  occurrences: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'occurrences', groupId] as const,
  myRequests: (userId: string | undefined) => ['groups', userId, 'my-requests'] as const,
  requests: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'requests', groupId] as const,
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
  photos: (userId: string | undefined) => ['groups', userId, 'photos'] as const,
  guests: (userId: string | undefined) => ['groups', userId, 'guests'] as const,
  settlements: (userId: string | undefined, groupId: string | undefined) =>
    ['groups', userId, 'settlements', groupId] as const,
}
