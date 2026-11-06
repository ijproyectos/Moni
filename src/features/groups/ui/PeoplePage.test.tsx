import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { emptyOverlay, type GroupOverlay } from '../mock/overlayStore'
import { PeoplePage } from './PeoplePage'

const ME = 'u-ana'
const BETO = 'u-beto'
const FRAN = 'guest-fran'
const LOLA = 'guest-lola'

const state = vi.hoisted(() => ({
  overlay: null as unknown as GroupOverlay,
  addGuest: vi.fn(),
  updateGuest: vi.fn(),
  removeGuest: vi.fn(),
  linkGuest: vi.fn(),
}))

vi.mock('../api/useGroupGuests', () => ({
  useAddGuest: () => ({ mutateAsync: state.addGuest, isPending: false }),
  useUpdateGuest: () => ({ mutateAsync: state.updateGuest, isPending: false }),
  useRemoveGuest: () => ({ mutateAsync: state.removeGuest, isPending: false }),
  useLinkGuest: () => ({ mutateAsync: state.linkGuest, isPending: false }),
}))
vi.mock('../api/useNewMemberNotice', () => ({ useNewMemberNotice: () => undefined }))
vi.mock('../api/useGroups', () => ({
  useGroupInvites: () => ({
    data: [
      {
        id: 'i1',
        groupId: 'g1',
        code: 'ABCDEFGH2345',
        expiresAt: '2999-01-01T00:00:00Z',
        maxUses: 20,
        uses: 0,
        revokedAt: null,
      },
    ],
    isLoading: false,
  }),
  useCreateInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/pro/ui/useReferralLink', () => ({ useReferralLink: () => 'moni.app/r/x' }))
vi.mock('../api/useGroupLedger', () => ({
  useGroupLedger: () => ({
    meId: ME,
    name: 'Viaje a Brasil',
    overlay: state.overlay,
    ledger: {
      people: [
        { id: ME, name: 'Vos', hasMoni: true, isMe: true },
        { id: BETO, name: 'Beto', hasMoni: true, isMe: false },
        { id: FRAN, name: 'Fran', hasMoni: false, isMe: false, alias: 'fran.mp' },
        { id: LOLA, name: 'Lola', hasMoni: false, isMe: false, alias: '' },
      ],
      nets: { [ME]: 40_000_00, [BETO]: 0, [FRAN]: -40_000_00, [LOLA]: 0 },
      paid: { [ME]: 100_000_00, [FRAN]: 0 },
      owed: { [ME]: 30_000_00, [BETO]: 30_000_00, [FRAN]: 40_000_00 },
      totalCents: 100_000_00,
      transfers: [],
      expenses: [],
    },
  }),
}))

function setup() {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/grupos/g1/personas']}>
        <Routes>
          <Route path="/grupos/:id/personas" element={<PeoplePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  Object.values(state).forEach((v) => typeof v === 'function' && 'mockReset' in v && v.mockReset())
  state.addGuest.mockResolvedValue('new')
  state.updateGuest.mockResolvedValue(undefined)
  state.removeGuest.mockResolvedValue(undefined)
  state.linkGuest.mockResolvedValue(undefined)
  state.overlay = {
    ...emptyOverlay(),
    guests: [
      { id: FRAN, name: 'Fran', alias: 'fran.mp' },
      { id: LOLA, name: 'Lola', alias: '' },
    ],
    // Fran took part in a stored expense; Lola has no records yet.
    expenses: [
      {
        id: 'x1',
        description: 'Cena',
        amountCents: 100_000_00,
        payers: [{ personId: ME, cents: 100_000_00 }],
        shares: [
          { personId: ME, cents: 30_000_00 },
          { personId: BETO, cents: 30_000_00 },
          { personId: FRAN, cents: 40_000_00 },
        ],
        occurredOn: '2026-10-20',
        templateSlug: null,
        methodLabel: 'por monto',
        createdAt: '2026-10-20T00:00:00Z',
      },
    ],
  }
})

describe('Personas del grupo (con y sin cuenta)', () => {
  it('shows people with an account and people without one, with their balances', () => {
    setup()
    const fran = screen.getByRole('button', { name: /Fran/ })
    expect(within(fran).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(fran).getByText('debe')).toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: /Beto/ })).queryByText('Sin cuenta'),
    ).toBeNull()
  })

  it('adds a person by name only, stored in the group', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Sumar persona/ }))
    expect(screen.getByText('Invitar con código')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Martina')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(state.addGuest).toHaveBeenCalledWith({ groupId: 'g1', name: 'Martina', alias: '' })
    expect(await screen.findByText('Martina se sumó al grupo')).toBeInTheDocument()
  })

  it('adds several people from the same window and says how many joined', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Sumar persona/ }))
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Martina')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await user.type(screen.getByLabelText('Nombre'), 'Paula')
    await user.type(screen.getByLabelText('Alias para cobrar'), 'paula.mp')
    await user.click(screen.getByRole('button', { name: 'Agregar 2 personas' }))
    expect(state.addGuest).toHaveBeenNthCalledWith(1, { groupId: 'g1', name: 'Martina', alias: '' })
    expect(state.addGuest).toHaveBeenNthCalledWith(2, {
      groupId: 'g1',
      name: 'Paula',
      alias: 'paula.mp',
    })
    expect(await screen.findByText('2 personas se sumaron al grupo')).toBeInTheDocument()
  })

  it('does not offer to add someone who is already in the group', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Sumar persona/ }))
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(screen.getByText('Ya hay alguien con ese nombre en el grupo.')).toBeInTheDocument()
    expect(state.addGuest).not.toHaveBeenCalled()
  })

  it('keeps the form open and says why when the name is already taken', async () => {
    state.addGuest.mockRejectedValue(new Error('guest_name_taken'))
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Sumar persona/ }))
    await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Paula')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(
      await screen.findByText('Ya hay alguien con ese nombre en el grupo.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('links a person without an account to a member only after confirming, and nothing happens before', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Fran/ }))
    await user.click(screen.getByRole('button', { name: /Vincular con una cuenta de Moni/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Beto/ }))
    expect(screen.getByText(/¿Vincular a Fran con Beto\?/)).toBeInTheDocument()
    expect(state.linkGuest).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sí, vincular' }))
    await waitFor(() =>
      expect(state.linkGuest).toHaveBeenCalledWith({ guestId: FRAN, userId: BETO }),
    )
    expect(await screen.findByText('Fran quedó vinculada con Beto')).toBeInTheDocument()
  })

  it('going back from the confirmation does not link anything', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Fran/ }))
    await user.click(screen.getByRole('button', { name: /Vincular con una cuenta de Moni/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Beto/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }))
    expect(state.linkGuest).not.toHaveBeenCalled()
  })

  it('does not offer to remove someone who already has records: it points to linking instead', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Fran/ }))
    await user.click(screen.getByRole('button', { name: /Quitar del grupo/ }))
    expect(screen.getByText('Fran ya tiene movimientos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar del grupo' })).toBeNull()
    expect(state.removeGuest).not.toHaveBeenCalled()
  })

  it('removes someone without records', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Lola/ }))
    await user.click(screen.getByRole('button', { name: /Quitar del grupo/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar del grupo' }))
    expect(state.removeGuest).toHaveBeenCalledWith(LOLA)
  })

  it('renames a person without an account', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Fran/ }))
    const name = screen.getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Francisca')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(state.updateGuest).toHaveBeenCalledWith({
      guestId: FRAN,
      name: 'Francisca',
      alias: 'fran.mp',
    })
  })

  it('members with an account cannot be edited or linked from here', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Beto/ }))
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.queryByRole('button', { name: /Vincular/ })).toBeNull()
    expect(sheet.getByText(/Tiene cuenta de Moni/)).toBeInTheDocument()
  })
})
