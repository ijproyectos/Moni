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
const createPersonal = vi.hoisted(() => vi.fn().mockResolvedValue('PERS2345'))

vi.mock('../api/useGroups', () => ({
  useGroupInvites: () => ({
    data: invitesData.current,
    isLoading: false,
    isSuccess: true,
  }),
  useCreateInvite: () => ({ mutateAsync: createInvite, isPending: false }),
  useRevokeInvite: () => ({ mutateAsync: revokeInvite, isPending: false }),
  useCreatePersonalInvite: () => ({ mutateAsync: createPersonal, isPending: false }),
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

  it('has only WhatsApp and Compartir (no separate copy button)', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Copiar/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument()
    expect(screen.getByText(/espera tu aprobación/)).toBeInTheDocument()
  })

  it('opens WhatsApp with the group name, code and join link in the message', () => {
    setup()
    const link = screen.getByRole('link', { name: 'WhatsApp' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('https://api.whatsapp.com/send?text=')).toBe(true)
    expect(href).toContain(encodeURIComponent('Asado & Amigos'))
    expect(href).toContain(encodeURIComponent('ABCD-2345'))
    expect(href).toContain(encodeURIComponent(`${window.location.origin}/unirse/${CODE}`))
  })

  it('the message has the group name, ONE link and the code, and the native share does not add the link again', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    const arg = share.mock.calls[0]?.[0] as { text: string; url?: string }
    expect(arg.url).toBeUndefined()
    const link = `${window.location.origin}/unirse/${CODE}`
    expect(arg.text).toBe(
      `Te invito a unirte a nuestro grupo Asado & Amigos en Moni.\n\nEntrá desde este enlace:\n${link}\n\nO ingresá este código en Moni:\nABCD-2345`,
    )
    expect(arg.text.split(link)).toHaveLength(2)
  })

  it('without the native share (desktop), Compartir copies the message', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('ABCD-2345')
  })

  it('disables sending and regenerating offline but keeps Listo', () => {
    act(() => onlineManager.setOnline(false))
    const onDone = vi.fn()
    setup(onDone)
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Generar un código nuevo/ })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).toBeNull()
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
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

  it('a personal link is made on demand, is never taken for the group code, and says it needs no approval', async () => {
    invitesData.current = [invite({ id: 'p1', code: 'ZZZZ9999', personal: true, maxUses: 1 }), invite()]
    const user = setup()
    expect(screen.getByText('ABCD-2345')).toBeInTheDocument()
    expect(screen.queryByText('ZZZZ-9999')).toBeNull()
    expect(screen.getByText(/Creá una invitación de un solo uso\. La persona podrá entrar sin aprobación adicional\. Válida por 7 días/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear enlace personal' }))
    expect(createPersonal).toHaveBeenCalledWith(GROUP)
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'WhatsApp' })).toHaveLength(2))
    const wa = screen.getAllByRole('link', { name: 'WhatsApp' }).at(-1) as HTMLElement
    expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('PERS2345')
    expect(screen.queryByRole('button', { name: /Copiar/ })).toBeNull()
    expect(createInvite).not.toHaveBeenCalled()
  })
})
