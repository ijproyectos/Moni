import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { JoinGroupPage } from './JoinGroupPage'
import { patchOverlay, useOverlays } from '../mock/overlayStore'

const GROUP = '99999999-9999-4999-8999-999999999999'
const mutateAsync = vi.hoisted(() => vi.fn())

vi.mock('../api/useGroups', () => ({
  useJoinGroup: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/features/auth/api/useProfile', () => ({ useProfile: () => ({ data: null }) }))

function Probe() {
  return <p>{useOverlays()[GROUP]?.deleted ? 'overlay-deleted' : 'overlay-visible'}</p>
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/unirse/:code" element={<JoinGroupPage />} />
        <Route path="/grupos/unirse" element={<p>pantalla del código</p>} />
        <Route path="/grupos/:id" element={<p>detalle del grupo</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('JoinGroupPage', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    patchOverlay(GROUP, { deleted: false })
  })

  it.each(['/unirse/ABCD-2345-WXYZ', '/unirse/abcd2345', '/unirse/ABCD-2345'])(
    'accepts %s and sends the code without dashes',
    async (url) => {
      mutateAsync.mockResolvedValue({ groupId: GROUP, alreadyMember: false })
      const user = renderAt(url)
      await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
      expect(mutateAsync.mock.calls[0]?.[0]).toMatch(/^[A-Z2-9]{8}([A-Z2-9]{4})?$/)
      expect(mutateAsync.mock.calls[0]?.[0]).not.toContain('-')
    },
  )

  it('rejects a link with a malformed code', () => {
    renderAt('/unirse/ABC')
    expect(screen.getByRole('alert')).toHaveTextContent('Ese link no es válido')
  })

  it('confirms the new membership and opens the group', async () => {
    mutateAsync.mockResolvedValue({ groupId: GROUP, alreadyMember: false })
    const user = renderAt('/unirse/ABCD-2345')
    await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByRole('heading', { name: 'Ya estás en el grupo' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Ver el grupo/ }))
    expect(await screen.findByText('detalle del grupo')).toBeVisible()
  })

  it('tells a member who uses a code again that they are already in', async () => {
    mutateAsync.mockResolvedValue({ groupId: GROUP, alreadyMember: true })
    const user = renderAt('/unirse/ABCD-2345')
    await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByRole('heading', { name: 'Ya sos parte de este grupo' })).toBeVisible()
  })

  it('shows a group the person had deleted locally again after joining it', async () => {
    patchOverlay(GROUP, { deleted: true })
    mutateAsync.mockResolvedValue({ groupId: GROUP, alreadyMember: false })
    const user = renderAt('/unirse/ABCD-2345')
    expect(screen.getByText('overlay-deleted')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByText('overlay-visible')).toBeVisible()
  })

  it('sends an unknown code back to the code screen as not found', async () => {
    mutateAsync.mockRejectedValue(new Error('invite_invalid'))
    const user = renderAt('/unirse/ABCD-2345')
    await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByText('pantalla del código')).toBeVisible()
  })

  it('keeps other failures (expired session) on the page instead of blaming the code', async () => {
    mutateAsync.mockRejectedValue({ message: 'not_authenticated' })
    const user = renderAt('/unirse/ABCD-2345')
    await user.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión venció')
    expect(screen.queryByText('pantalla del código')).toBeNull()
  })
})
