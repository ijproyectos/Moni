import { listJoinRequests, listMyJoinRequests, requestJoinGroup } from './groupsRepository'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

const G = '99999999-9999-4999-8999-999999999999'

describe('requestJoinGroup', () => {
  beforeEach(() => rpc.mockReset())

  it('a code that needs approval leaves a pending request: no group is returned to open', async () => {
    rpc.mockResolvedValue({ data: [{ result: 'pending', group_id: G }], error: null })
    await expect(requestJoinGroup('ABCD2345')).resolves.toEqual({ kind: 'pending', groupId: G })
    expect(rpc).toHaveBeenCalledWith('request_join_group', { p_code: 'ABCD2345' })
  })

  it('an old code joins right away; a member is told they are already in', async () => {
    rpc.mockResolvedValueOnce({ data: [{ result: 'joined', group_id: G }], error: null })
    await expect(requestJoinGroup('ABCD2345')).resolves.toEqual({ kind: 'joined', groupId: G })
    rpc.mockResolvedValueOnce({ data: [{ result: 'already_member', group_id: G }], error: null })
    await expect(requestJoinGroup('ABCD2345')).resolves.toEqual({ kind: 'already_member', groupId: G })
  })

  it('an invalid code is the uniform invite_invalid error', async () => {
    rpc.mockResolvedValue({ data: [{ result: 'invalid', group_id: null }], error: null })
    await expect(requestJoinGroup('ABCD2345')).rejects.toThrow('invite_invalid')
  })

  it('against a database without the requests it falls back to the direct join', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    rpc.mockResolvedValueOnce({ data: G, error: null })
    await expect(requestJoinGroup('ABCD2345')).resolves.toEqual({ kind: 'joined', groupId: G })
    expect(rpc).toHaveBeenLastCalledWith('join_group', { p_code: 'ABCD2345' })
  })

  it('other errors are not swallowed', async () => {
    const error = { code: '54000', message: 'requests_throttled' }
    rpc.mockResolvedValue({ data: null, error })
    await expect(requestJoinGroup('ABCD2345')).rejects.toBe(error)
  })
})

describe('request lists', () => {
  beforeEach(() => rpc.mockReset())

  it('maps my requests, and is empty when the database does not have them yet', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ request_id: 'r1', group_id: G, group_name: 'Hogar', status: 'pending', created_at: '2026-11-21T00:00:00Z' }],
      error: null,
    })
    await expect(listMyJoinRequests()).resolves.toEqual([
      { id: 'r1', groupId: G, groupName: 'Hogar', status: 'pending', createdAt: '2026-11-21T00:00:00Z' },
    ])
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'missing' } })
    await expect(listMyJoinRequests()).resolves.toEqual([])
  })

  it('maps the requests an administrator sees; the server refuses anybody else', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ request_id: 'r1', user_id: 'u2', display_name: 'Dani', avatar_url: null, created_at: '2026-11-21T00:00:00Z' }],
      error: null,
    })
    await expect(listJoinRequests(G)).resolves.toEqual([
      { id: 'r1', userId: 'u2', displayName: 'Dani', avatarUrl: null, createdAt: '2026-11-21T00:00:00Z' },
    ])
    const refused = { code: '42501', message: 'not_group_admin' }
    rpc.mockResolvedValueOnce({ data: null, error: refused })
    await expect(listJoinRequests(G)).rejects.toBe(refused)
  })
})

describe('contacts and invitations', () => {
  beforeEach(() => rpc.mockReset())

  it('maps the contacts: only id, name and photo', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u2', display_name: 'Beto', avatar_url: null }], error: null })
    const { listContacts } = await import('./groupsRepository')
    await expect(listContacts()).resolves.toEqual([{ userId: 'u2', displayName: 'Beto', avatarUrl: null }])
  })

  it('without the database functions there are no contacts, invitations or hidden ones (nothing breaks)', async () => {
    const { listContacts, listMyInvitations, listGroupInvitations, listHiddenContacts } = await import('./groupsRepository')
    for (const fn of [() => listContacts(), () => listMyInvitations(), () => listGroupInvitations(G), () => listHiddenContacts()]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
      await expect(fn()).resolves.toEqual([])
    }
  })

  it('inviting and answering go through the server, which decides (errors are not swallowed)', async () => {
    const { inviteContact, respondInvitation, setContactPref } = await import('./groupsRepository')
    rpc.mockResolvedValueOnce({ data: 'inv-1', error: null })
    await expect(inviteContact(G, 'u2')).resolves.toBe('inv-1')
    expect(rpc).toHaveBeenLastCalledWith('invite_contact', { p_group: G, p_user: 'u2' })
    rpc.mockResolvedValueOnce({ data: G, error: null })
    await expect(respondInvitation('inv-1', true)).resolves.toBe(G)
    expect(rpc).toHaveBeenLastCalledWith('respond_group_invitation', { p_invitation: 'inv-1', p_accept: true })
    const refused = { code: '42501', message: 'not_group_admin' }
    rpc.mockResolvedValueOnce({ data: null, error: refused })
    await expect(inviteContact(G, 'u2')).rejects.toBe(refused)
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await setContactPref('u2', true, true)
    expect(rpc).toHaveBeenLastCalledWith('set_contact_pref', { p_contact: 'u2', p_hidden: true, p_blocked: true })
  })
})

describe('recurring expenses of a home group', () => {
  beforeEach(() => rpc.mockReset())

  it('maps the saved definition and the periods (amounts in cents)', async () => {
    const { listGroupRecurring, listRecurringOccurrences } = await import('./groupsRepository')
    rpc.mockResolvedValueOnce({
      data: [{
        id: 'r1', name: 'Alquiler', template_slug: 'hogar', amount: 600000, period: 'monthly', anchor_on: '2026-12-05',
        next_due_on: '2026-12-05', paid_by: 'u1', paid_by_name: 'Iara', split_method: 'equal', status: 'active',
        participants: [{ user_id: 'u1', name: 'Iara', percent: null }],
      }],
      error: null,
    })
    await expect(listGroupRecurring(G)).resolves.toMatchObject([{ id: 'r1', amountCents: 600_000_00, paidByName: 'Iara' }])
    rpc.mockResolvedValueOnce({
      data: [{ id: 'o1', recurring_id: 'r1', period_key: '2026-12-01', due_on: '2026-12-05', amount: 42000.5, status: 'pending', expense_id: null, resolved_at: null }],
      error: null,
    })
    await expect(listRecurringOccurrences(G)).resolves.toMatchObject([{ amountCents: 42_000_50, status: 'pending' }])
  })

  it('confirming sends the period amount (or none) and the server decides; creating carries the request key', async () => {
    const { confirmRecurringOccurrence, createGroupRecurring, updateGroupName } = await import('./groupsRepository')
    rpc.mockResolvedValueOnce({ data: 'e1', error: null })
    await expect(confirmRecurringOccurrence('o1', 42_000_00)).resolves.toBe('e1')
    expect(rpc).toHaveBeenLastCalledWith('confirm_group_recurring_occurrence', { p_occurrence: 'o1', p_amount: 42000, p_payer_account_id: null })
    rpc.mockResolvedValueOnce({ data: 'e1', error: null })
    await confirmRecurringOccurrence('o1', null)
    expect(rpc).toHaveBeenLastCalledWith('confirm_group_recurring_occurrence', { p_occurrence: 'o1', p_amount: null, p_payer_account_id: null })
    rpc.mockResolvedValueOnce({ data: 'r1', error: null })
    await createGroupRecurring(G, { name: 'Luz', templateSlug: 'hogar', amountCents: 35_000_00, period: 'monthly', anchorOn: '2026-12-05', paidBy: 'u1', splitMethod: 'percent', participants: [{ userId: 'u1', percent: 60 }, { userId: 'u2', percent: 40 }] }, 'key-1')
    expect(rpc).toHaveBeenLastCalledWith('create_group_recurring', expect.objectContaining({ p_request_key: 'key-1', p_percents: [60, 40], p_participants: ['u1', 'u2'], p_amount: 35000 }))
    const refused = { code: '42501', message: 'not_group_admin' }
    rpc.mockResolvedValueOnce({ data: null, error: refused })
    await expect(updateGroupName(G, 'Nuevo')).rejects.toBe(refused)
  })

  it('without the database functions it shows nothing instead of breaking', async () => {
    const { listGroupRecurring, listRecurringOccurrences, processGroupRecurring } = await import('./groupsRepository')
    for (const fn of [() => listGroupRecurring(G), () => listRecurringOccurrences(G)]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
      await expect(fn()).resolves.toEqual([])
    }
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    await expect(processGroupRecurring(G)).resolves.toBeUndefined()
  })
})
