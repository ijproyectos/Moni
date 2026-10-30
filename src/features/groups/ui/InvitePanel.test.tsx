import { onlineManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GroupInvite } from '../domain/group'
import { InvitePanel } from './InvitePanel'

const GROUP = '99999999-9999-4999-8999-999999999999'
const CODE = 'ABCD2345'

const invitesData = vi.hoisted(() => ({ current: [] as GroupInvite[] }))
const createInvite = vi.hoisted(() => vi.fn().mockResolvedValue('NEWC2345'))
const revokeInvite = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../api/useGroups', () => ({
  useGroupInvites: () => ({
    data: invitesData.current,
    isLoading: false,
    isSuccess: true,
  }),
  useCreateInvite: () => ({ mutateAsync: createInvite, isPending: false }),
  useRevokeInvite: () => ({ mutateAsync: revokeInvite, isPending: false }),
}))

const invite = (over: Partial<GroupInvite> = {}): GroupInvite => ({
  id: 'inv-1',
  groupId: GROUP,
  code: CODE,
  createdBy: 'u1',
  expiresAt: '2999-01-01T00:00:00Z',
  maxUses: 10,
  uses: 0,
  revokedAt: null,
  ...over,
})

function setup(onDone?: () => void) {
  render(<InvitePanel groupId={GROUP} groupName="Asado & Amigos" onDone={onDone} />)
  return userEvent.setup()
}

describe('InvitePanel', () => {
  const originalShare = navigator.share
  beforeEach(() => {
    invitesData.current = [invite()]
    createInvite.mockClear()
    revokeInvite.mockClear()
  })
  afterEach(() => {
    act(() => onlineManager.setOnline(true))
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true })
  })

  it('shows the code in readable groups', () => {
    setup()
    expect(screen.getByText('ABCD-2345')).toBeInTheDocument()
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('still shows a legacy 12-char code in blocks of four', () => {
    invitesData.current = [invite({ code: 'ABCD2345EFGH' })]
    render(<InvitePanel groupId={GROUP} groupName="Casa" />)
    expect(screen.getByText('ABCD-2345-EFGH')).toBeInTheDocument()
  })

  it('copies the raw code and confirms with an accessible status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(screen.getByRole('button', { name: 'Copiar código' }))
    expect(writeText).toHaveBeenCalledWith(CODE)
    expect(await screen.findByRole('status')).toHaveTextContent('Código copiado')
  })

  it('opens WhatsApp with the group name, code and join link in the message', () => {
    setup()
    const link = screen.getByRole('link', { name: /Enviar por WhatsApp/ })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(href).toContain(encodeURIComponent('Asado & Amigos'))
    expect(href).toContain(encodeURIComponent('ABCD-2345'))
    expect(href).toContain(encodeURIComponent(`${window.location.origin}/unirse/${CODE}`))
  })

  it('offers the native share only when the browser supports it', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    const first = setup()
    void first
    expect(screen.queryByRole('button', { name: 'Compartir' })).toBeNull()
    cleanupRender()

    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0]?.[0].text).toContain('ABCD-2345')
  })

  it('disables sending and regenerating offline but keeps Listo', () => {
    act(() => onlineManager.setOnline(false))
    const onDone = vi.fn()
    setup(onDone)
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Generar un código nuevo/ })).toBeDisabled()
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Enviar por WhatsApp/ })).toBeDisabled()
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled()
  })

  it('Listo calls onDone', async () => {
    const onDone = vi.fn()
    const user = setup(onDone)
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('generates a code when the group has none', async () => {
    invitesData.current = []
    setup()
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith(GROUP))
  })

  it('does not generate a code offline', () => {
    invitesData.current = []
    act(() => onlineManager.setOnline(false))
    setup()
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('regenerating revokes the current invite and creates a new one', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Generar un código nuevo/ }))
    expect(revokeInvite).toHaveBeenCalledWith('inv-1')
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith(GROUP))
  })
})

function cleanupRender() {
  document.body.innerHTML = ''
}
