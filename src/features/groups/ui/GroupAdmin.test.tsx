import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { GroupMember, HiddenGroup } from '../domain/group'
import { ArchiveGroupSheet, AdminMembersSection, HideGroupSheet, JoinRequestsSection } from './GroupAdminSections'
import { HiddenGroupsEntry } from './HiddenGroups'
import { ContactsInvite } from './ContactsInvite'
import { PendingInvitations } from './PendingInvitations'
import { PendingRequests } from './PendingRequests'

const GROUP = '99999999-9999-4999-8999-999999999999'
const archive = vi.hoisted(() => vi.fn())
const hide = vi.hoisted(() => vi.fn())
const restore = vi.hoisted(() => vi.fn())
const setRole = vi.hoisted(() => vi.fn())
const membersData = vi.hoisted(() => ({ current: [] as GroupMember[] }))
const hiddenData = vi.hoisted(() => ({ current: [] as HiddenGroup[] }))
const myRequestsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const requestsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const contactsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const hiddenContactsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const groupInvitationsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const myInvitationsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const inviteC = vi.hoisted(() => vi.fn())
const cancelInv = vi.hoisted(() => vi.fn())
const setPref = vi.hoisted(() => vi.fn())
const respondInv = vi.hoisted(() => vi.fn())
const cancelReq = vi.hoisted(() => vi.fn())
const approveReq = vi.hoisted(() => vi.fn())
const rejectReq = vi.hoisted(() => vi.fn())

vi.mock('../api/useGroups', () => ({
  useArchiveGroup: () => ({ mutateAsync: archive, isPending: false }),
  useHideGroup: () => ({ mutateAsync: hide, isPending: false }),
  useRestoreGroup: () => ({ mutateAsync: restore, isPending: false }),
  useSetMemberRole: () => ({ mutateAsync: setRole, isPending: false }),
  useGroupMembers: () => ({ data: membersData.current }),
  useHiddenGroups: () => ({ data: hiddenData.current }),
  useContacts: () => ({ data: contactsData.current }),
  useHiddenContacts: () => ({ data: hiddenContactsData.current }),
  useGroupInvitations: () => ({ data: groupInvitationsData.current }),
  useInviteContact: () => ({ mutateAsync: inviteC, isPending: false }),
  useCancelInvitation: () => ({ mutateAsync: cancelInv, isPending: false }),
  useSetContactPref: () => ({ mutateAsync: setPref, isPending: false }),
  useMyInvitations: () => ({ data: myInvitationsData.current }),
  useRespondInvitation: () => ({ mutateAsync: respondInv, isPending: false }),
  useMyJoinRequests: () => ({ data: myRequestsData.current }),
  useCancelJoinRequest: () => ({ mutateAsync: cancelReq, isPending: false }),
  useJoinRequests: () => ({ data: requestsData.current }),
  useApproveJoinRequest: () => ({ mutateAsync: approveReq, isPending: false }),
  useRejectJoinRequest: () => ({ mutateAsync: rejectReq, isPending: false }),
}))

const member = (userId: string, role: 'owner' | 'member', name: string): GroupMember => ({
  userId, displayName: name, avatarUrl: null, role, joinedAt: '2026-11-01T00:00:00Z', leftAt: null,
})
const hiddenGroup = (over: Partial<HiddenGroup>): HiddenGroup => ({
  id: 'g1', name: 'Depto', kind: 'hogar', role: 'member', memberCount: 3, myNetCents: 0,
  lastActivity: '2026-11-01T00:00:00Z', hiddenAt: null, archivedAt: null, ...over,
})

beforeEach(() => {
  archive.mockReset().mockResolvedValue(undefined)
  hide.mockReset().mockResolvedValue(undefined)
  restore.mockReset().mockResolvedValue(undefined)
  setRole.mockReset().mockResolvedValue(undefined)
  cancelReq.mockReset().mockResolvedValue(undefined)
  approveReq.mockReset().mockResolvedValue('g1')
  rejectReq.mockReset().mockResolvedValue(undefined)
  myRequestsData.current = []
  membersData.current = []
  contactsData.current = []
  hiddenContactsData.current = []
  groupInvitationsData.current = []
  myInvitationsData.current = []
  inviteC.mockReset().mockResolvedValue('inv')
  cancelInv.mockReset().mockResolvedValue(undefined)
  setPref.mockReset().mockResolvedValue(undefined)
  respondInv.mockReset().mockResolvedValue('g1')
  requestsData.current = []
})

describe('ArchiveGroupSheet ("Eliminar para todos")', () => {
  it('explains that it is archived (not deleted), has no name field and archives with one tap', async () => {
    const onDone = vi.fn()
    render(<ArchiveGroupSheet groupId={GROUP} name="Depto" serverName="Depto Palermo" onClose={vi.fn()} onDone={onDone} />)
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: /Depto/ })).toBeInTheDocument()
    expect(screen.getByText(/el historial se conserva/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Eliminar para todos' }))
    expect(archive).toHaveBeenCalledTimes(1)
    expect(archive).toHaveBeenCalledWith({ groupId: GROUP, name: 'Depto Palermo' })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('does not send twice while it is processing', async () => {
    archive.mockReturnValue(new Promise(() => {}))
    render(<ArchiveGroupSheet groupId={GROUP} name="Depto" onClose={vi.fn()} onDone={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar para todos' }))
    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Eliminando…' }))
    expect(archive).toHaveBeenCalledTimes(1)
  })

  it('does not say it worked when the server refuses (debts): nothing closes and it can be retried', async () => {
    archive.mockRejectedValue({ message: 'group_has_open_balances' })
    const onDone = vi.fn()
    render(<ArchiveGroupSheet groupId={GROUP} name="Depto" onClose={vi.fn()} onDone={onDone} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar para todos' }))
    await waitFor(() => expect(archive).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar para todos' })).toBeEnabled())
  })
})

describe('HideGroupSheet ("Eliminar para mí")', () => {
  it('says that only I stop seeing it, then hides it', async () => {
    const onDone = vi.fn()
    render(<HideGroupSheet groupId={GROUP} name="Depto" onClose={vi.fn()} onDone={onDone} />)
    expect(screen.getByText(/Los demás siguen con acceso/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar para mí' }))
    expect(hide).toHaveBeenCalledWith(GROUP)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('stays open when it fails', async () => {
    hide.mockRejectedValue(new Error('x'))
    const onDone = vi.fn()
    render(<HideGroupSheet groupId={GROUP} name="Depto" onClose={vi.fn()} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar para mí' }))
    await waitFor(() => expect(hide).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('AdminMembersSection', () => {
  it('promotes a member and the last administrator cannot be removed', async () => {
    membersData.current = [member('me', 'owner', 'Iara'), member('b', 'member', 'Jonatan')]
    render(<AdminMembersSection groupId={GROUP} meId="me" />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Quitar administrador a Vos' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Hacer administrador a Jonatan' }))
    expect(setRole).toHaveBeenCalledWith({ groupId: GROUP, userId: 'b', role: 'owner' })
  })

  it('with two administrators either can step down', () => {
    membersData.current = [member('me', 'owner', 'Iara'), member('b', 'owner', 'Jonatan')]
    render(<AdminMembersSection groupId={GROUP} meId="me" />)
    expect(screen.getByRole('button', { name: 'Quitar administrador a Jonatan' })).toBeEnabled()
  })
})

describe('Eliminados y archivados', () => {
  it('shows nothing without hidden or archived groups', () => {
    hiddenData.current = []
    render(<MemoryRouter><HiddenGroupsEntry /></MemoryRouter>)
    expect(screen.queryByText(/Eliminados y archivados/)).toBeNull()
  })

  it('restores a hidden group and opens an archived one only to read it', async () => {
    hiddenData.current = [
      hiddenGroup({ id: 'h1', name: 'Depto', hiddenAt: '2026-11-02T00:00:00Z' }),
      hiddenGroup({ id: 'a1', name: 'Viaje', archivedAt: '2026-11-03T00:00:00Z' }),
    ]
    render(<MemoryRouter><HiddenGroupsEntry /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Eliminados y archivados \(2\)/ }))
    await user.click(screen.getByRole('button', { name: 'Restaurar Depto' }))
    expect(restore).toHaveBeenCalledWith('h1')
    expect(screen.getByRole('link', { name: 'Ver historial' })).toHaveAttribute('href', '/grupos/a1')
    expect(screen.queryByRole('button', { name: 'Restaurar Viaje' })).toBeNull()
  })
})

describe('Invitations are for administrators', () => {
  it('the header shows Invitar only when an invite handler is given (administrators)', async () => {
    const { GroupDetailHeader } = await import('./GroupDetailHeader')
    const props = { name: 'Depto', kind: 'hogar' as const, photoUrl: null, onBack: vi.fn(), onOptions: vi.fn() }
    const view = render(<GroupDetailHeader {...props} onInvite={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Invitar' })).toBeInTheDocument()
    view.unmount()
    render(<GroupDetailHeader {...props} />)
    expect(screen.queryByRole('button', { name: 'Invitar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Opciones del grupo' })).toBeInTheDocument()
  })

  it('the add-person sheet hides the code card from people who are not administrators', async () => {
    const { AddPersonSheet } = await import('./AddPersonSheet')
    const props = { code: 'ABCD2345', groupName: 'Depto', onClose: vi.fn(), onAddGuest: vi.fn() }
    const view = render(<AddPersonSheet {...props} />)
    expect(screen.getByText('Invitar con código')).toBeInTheDocument()
    view.unmount()
    render(<AddPersonSheet {...props} canInvite={false} />)
    expect(screen.queryByText('Invitar con código')).toBeNull()
    expect(screen.getByText('Agregar por nombre')).toBeInTheDocument()
  })
})

describe('Solicitudes de ingreso', () => {
  it('administrators see who is waiting and can accept or refuse', async () => {
    requestsData.current = [{ id: 'r1', userId: 'u2', displayName: 'Dani', avatarUrl: null, createdAt: '2026-11-21T00:00:00Z' }]
    render(<JoinRequestsSection groupId={GROUP} />)
    const user = userEvent.setup()
    expect(screen.getByText(/Solicitudes de ingreso \(1\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aceptar a Dani' }))
    expect(approveReq).toHaveBeenCalledWith('r1')
    await user.click(screen.getByRole('button', { name: 'Rechazar a Dani' }))
    expect(rejectReq).toHaveBeenCalledWith('r1')
  })

  it('says so when nobody is waiting', () => {
    render(<JoinRequestsSection groupId={GROUP} />)
    expect(screen.getByText(/No hay solicitudes pendientes/)).toBeInTheDocument()
  })

  it('the person sees only the group name while the request is pending, and can cancel it', async () => {
    myRequestsData.current = [
      { id: 'r1', groupId: GROUP, groupName: 'Asado', status: 'pending', createdAt: '2026-11-21T00:00:00Z' },
      { id: 'r2', groupId: 'g2', groupName: 'Viaje', status: 'rejected', createdAt: '2026-11-20T00:00:00Z' },
    ]
    render(<PendingRequests />)
    expect(screen.getByText('Esperando que un administrador te acepte')).toBeInTheDocument()
    expect(screen.getByText('No te aceptaron esta vez')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud a Asado' }))
    expect(cancelReq).toHaveBeenCalledWith('r1')
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud a Viaje' })).toBeNull()
  })

  it('renders nothing without requests', () => {
    const { container } = render(<PendingRequests />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Personas de Moni', () => {
  const contact = (id: string, name: string) => ({ userId: id, displayName: name, avatarUrl: null })

  it('shows nothing without contacts: the code stays the way in', () => {
    const { container } = render(<ContactsInvite groupId={GROUP} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists contacts who are not in the group yet and invites one with a tap', async () => {
    contactsData.current = [contact('b', 'Beto'), contact('c', 'Cami')]
    membersData.current = [member('b', 'member', 'Beto')]
    render(<ContactsInvite groupId={GROUP} />)
    expect(screen.queryByText('Beto')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a Cami' }))
    expect(inviteC).toHaveBeenCalledWith({ groupId: GROUP, userId: 'c' })
  })

  it('shows only 3 people at first and "Ver más" opens everybody with a search by name (accents and case do not matter)', async () => {
    contactsData.current = ['Ana María', 'Beto', 'Cami', 'Dani', 'Eze'].map((n, i) => contact('u' + i, n))
    render(<ContactsInvite groupId={GROUP} />)
    expect(screen.getByText('Cami')).toBeInTheDocument()
    expect(screen.queryByText('Dani')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }))
    expect(screen.getByText('Eze')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar entre tus contactos'), 'maria')
    expect(screen.getAllByText('Ana María').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beto')).toHaveLength(1) // only the preview behind the sheet
  })

  it('has no "Ver más" with 3 people or fewer', () => {
    contactsData.current = ['Ana', 'Beto', 'Cami'].map((n, i) => contact('u' + i, n))
    render(<ContactsInvite groupId={GROUP} />)
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull()
  })

  it('shows how each invitation stands and lets the administrator cancel a pending one', async () => {
    contactsData.current = [contact('b', 'Beto'), contact('c', 'Cami'), contact('d', 'Dani')]
    groupInvitationsData.current = [
      { id: 'i1', userId: 'b', displayName: 'Beto', avatarUrl: null, status: 'pending', createdAt: '' },
      { id: 'i2', userId: 'c', displayName: 'Cami', avatarUrl: null, status: 'declined', createdAt: '' },
    ]
    render(<ContactsInvite groupId={GROUP} />)
    expect(screen.getByText('Invitación enviada')).toBeInTheDocument()
    expect(screen.getByText('No aceptó')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a invitar a Cami' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar invitación a Beto' }))
    expect(cancelInv).toHaveBeenCalledWith('i1')
  })

  it('the only option of the menu is "Quitar de la lista": it hides the person, never blocks them', async () => {
    contactsData.current = [contact('b', 'Beto')]
    hiddenContactsData.current = [{ ...contact('x', 'Xavi'), hidden: true, blocked: true }]
    render(<ContactsInvite groupId={GROUP} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Más opciones de Beto' }))
    expect(screen.queryByRole('button', { name: 'Bloquear' })).toBeNull()
    expect(screen.queryByText(/Ocultos y bloqueados/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Quitar de la lista' }))
    expect(setPref).toHaveBeenCalledWith({ contactId: 'b', hidden: true, blocked: false })
  })

  it('the invited person sees only the group name and who invited them, and answers', async () => {
    myInvitationsData.current = [{ id: 'i1', groupId: 'g1', groupName: 'Hogar', invitedByName: 'Ana', createdAt: '' }]
    render(<MemoryRouter><PendingInvitations /></MemoryRouter>)
    expect(screen.getByText('Te invitó Ana')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar invitación a Hogar' }))
    expect(respondInv).toHaveBeenCalledWith({ invitationId: 'i1', accept: false })
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar invitación a Hogar' }))
    expect(respondInv).toHaveBeenCalledWith({ invitationId: 'i1', accept: true })
  })
})
