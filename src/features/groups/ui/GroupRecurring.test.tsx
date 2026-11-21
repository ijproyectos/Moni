import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import type { GroupMember, GroupRecurring, RecurringOccurrence } from '../domain/group'
import { emptyOverlay } from '../mock/overlayStore'
import { EditGroupSheet } from './EditGroupSheet'
import { GroupRecurringPage } from './GroupRecurringPage'
import { RecurringFormSheet } from './RecurringFormSheet'

const G = '99999999-9999-4999-8999-999999999999'
const state = vi.hoisted(() => ({
  recurring: [] as unknown[],
  occurrences: [] as unknown[],
  members: [] as unknown[],
  admin: true,
  kind: 'hogar',
  confirm: vi.fn(),
  skip: vi.fn(),
  setStatus: vi.fn(),
  save: vi.fn(),
  rename: vi.fn(),
}))

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../api/useGroups', () => ({
  useGroup: () => ({ data: { id: G, kind: state.kind, name: 'Depto' } }),
  useGroupRecurring: () => ({ data: state.recurring, isLoading: false, isError: false }),
  useRecurringOccurrences: () => ({ data: state.occurrences }),
  useGroupMembers: () => ({ data: state.members }),
  useIsGroupAdmin: () => state.admin,
  useConfirmOccurrence: () => ({ mutateAsync: state.confirm, isPending: false }),
  useSkipOccurrence: () => ({ mutateAsync: state.skip, isPending: false }),
  useSetRecurringStatus: () => ({ mutateAsync: state.setStatus, isPending: false }),
  useSaveRecurring: () => ({ mutateAsync: state.save, isPending: false }),
  useUpdateGroupName: () => ({ mutateAsync: state.rename, isPending: false }),
  useJoinRequests: () => ({ data: [] }),
  useApproveJoinRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectJoinRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('./GroupPhotoEditor', () => ({ GroupPhotoEditor: () => null }))

const member = (userId: string, name: string): GroupMember => ({
  userId, displayName: name, avatarUrl: null, role: 'member', joinedAt: '2026-11-01T00:00:00Z', leftAt: null,
})
const rec = (over: Partial<GroupRecurring> = {}): GroupRecurring => ({
  id: 'r1', name: 'Alquiler', templateSlug: 'hogar', amountCents: 600_000_00, period: 'monthly', anchorOn: '2026-12-05',
  nextDueOn: '2026-12-05', paidBy: 'me', paidByName: 'Iara', splitMethod: 'equal', status: 'active',
  participants: [{ userId: 'me', name: 'Iara', percent: null }, { userId: 'b', name: 'Jonatan', percent: null }, { userId: 'c', name: 'Cami', percent: null }],
  ...over,
})
const occ = (over: Partial<RecurringOccurrence> = {}): RecurringOccurrence => ({
  id: 'o1', recurringId: 'r1', periodKey: '2026-12-01', dueOn: '2026-12-05', amountCents: 600_000_00, status: 'pending',
  expenseId: null, resolvedAt: null, ...over,
})

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/grupos/${G}/recurrentes`]}>
      <ToastProvider>
        <Routes>
          <Route path="/grupos/:id/recurrentes" element={<GroupRecurringPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  Object.assign(state, { recurring: [], occurrences: [], members: [member('me', 'Iara'), member('b', 'Jonatan'), member('c', 'Cami')], admin: true, kind: 'hogar' })
  for (const f of [state.confirm, state.skip, state.setStatus, state.save, state.rename]) f.mockReset().mockResolvedValue(undefined)
})

describe('Gastos recurrentes (Hogar)', () => {
  it('a period waiting is shown with its amount and people, and one tap registers it', async () => {
    state.recurring = [rec()]
    state.occurrences = [occ()]
    const user = renderPage()
    expect(screen.getByText('Tenés un gasto recurrente para registrar')).toBeInTheDocument()
    expect(screen.getAllByText(/Entre Iara, Jonatan, Cami · \$200\.000 c\/u/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Confirmar gasto/ }))
    expect(state.confirm).toHaveBeenCalledWith({ occurrenceId: 'o1', amountCents: null })
  })

  it('a variable expense: the amount of the period can be changed before confirming', async () => {
    state.recurring = [rec({ name: 'Luz', amountCents: 35_000_00 })]
    state.occurrences = [occ({ amountCents: 35_000_00 })]
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Cambiar importe' }))
    const input = screen.getByLabelText('Importe de Luz para este período')
    await user.clear(input)
    await user.type(input, '42000')
    await user.click(screen.getByRole('button', { name: /Confirmar gasto/ }))
    expect(state.confirm).toHaveBeenCalledWith({ occurrenceId: 'o1', amountCents: 42_000_00 })
  })

  it('whoever does not pay it and is not an administrator cannot confirm it', () => {
    state.admin = false
    state.recurring = [rec({ paidBy: 'b', paidByName: 'Jonatan' })]
    state.occurrences = [occ()]
    renderPage()
    expect(screen.queryByRole('button', { name: /Confirmar gasto/ })).toBeNull()
    expect(screen.getByText(/Lo registra Jonatan o un administrador/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar gasto recurrente/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar Alquiler' })).toBeNull()
  })

  it('administrators edit, pause and delete (with confirmation); what was registered is kept', async () => {
    state.recurring = [rec()]
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Pausar Alquiler' }))
    expect(state.setStatus).toHaveBeenCalledWith({ id: 'r1', status: 'paused' })
    await user.click(screen.getByRole('button', { name: 'Eliminar Alquiler' }))
    expect(state.setStatus).not.toHaveBeenCalledWith({ id: 'r1', status: 'removed' })
    expect(screen.getByText(/Los gastos que ya registraste se conservan/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Eliminar gasto recurrente' }))
    expect(state.setStatus).toHaveBeenCalledWith({ id: 'r1', status: 'removed' })
  })

  it('the history lists registered, pending and skipped periods', async () => {
    state.recurring = [rec()]
    state.occurrences = [
      occ({ id: 'o2', dueOn: '2026-12-05', status: 'pending' }),
      occ({ id: 'o3', periodKey: '2026-11-01', dueOn: '2026-11-05', status: 'registered', expenseId: 'e1', amountCents: 580_000_00 }),
      occ({ id: 'o4', periodKey: '2026-10-01', dueOn: '2026-10-05', status: 'skipped' }),
    ]
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Ver períodos de Alquiler' }))
    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(screen.getByText('Omitido')).toBeInTheDocument()
    expect(screen.getByText('$580.000')).toBeInTheDocument()
  })

  it('other kinds of group are told it is only for Hogar', () => {
    state.kind = 'amigos'
    renderPage()
    expect(screen.getByText('Solo para grupos de Hogar')).toBeInTheDocument()
  })
})

describe('Formulario de gasto recurrente', () => {
  const open = (editing: GroupRecurring | null = null) => {
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <RecurringFormSheet groupId={G} members={[member('me', 'Iara'), member('b', 'Jonatan')]} meId="me" editing={editing} onClose={onClose} />
      </ToastProvider>,
    )
    return { onClose, user: userEvent.setup() }
  }

  it('creates the expense with one request key, and closes only after the server confirmed', async () => {
    const { onClose, user } = open()
    await user.click(screen.getByRole('button', { name: 'Alquiler' }))
    await user.type(screen.getByLabelText('Importe estimado'), '600000')
    await user.click(screen.getByRole('button', { name: 'Crear gasto recurrente' }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    const call = state.save.mock.calls[0]?.[0] as { id: null; requestKey: string; values: { name: string; amountCents: number; splitMethod: string; participants: { userId: string }[] } }
    expect(call.id).toBeNull()
    expect(call.requestKey).toMatch(/[0-9a-f-]{36}/)
    expect(call.values).toMatchObject({ name: 'Alquiler', amountCents: 600_000_00, splitMethod: 'equal' })
    expect(call.values.participants.map((p) => p.userId)).toEqual(['me', 'b'])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not close nor say it was created when the server refuses', async () => {
    state.save.mockRejectedValue({ message: 'not_group_admin' })
    const { onClose, user } = open()
    await user.type(screen.getByLabelText('Nombre del gasto'), 'Expensas')
    await user.type(screen.getByLabelText('Importe estimado'), '50000')
    await user.click(screen.getByRole('button', { name: 'Crear gasto recurrente' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('percentages have to add up to 100 before anything is sent', async () => {
    const { user } = open()
    await user.type(screen.getByLabelText('Nombre del gasto'), 'Internet')
    await user.type(screen.getByLabelText('Importe estimado'), '10000')
    await user.click(screen.getByRole('button', { name: 'Porcentajes' }))
    await user.type(screen.getByLabelText('Porcentaje de Vos'), '60')
    await user.type(screen.getByLabelText('Porcentaje de Jonatan'), '30')
    await user.click(screen.getByRole('button', { name: 'Crear gasto recurrente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Los porcentajes tienen que sumar 100')
    expect(state.save).not.toHaveBeenCalled()
  })
})

describe('Editar grupo: el nombre se guarda de verdad', () => {
  const people = [{ id: 'me', name: 'Vos', hasMoni: true, isMe: true }]
  const open = (isAdmin: boolean) => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <ToastProvider>
          <EditGroupSheet groupId={G} kind="hogar" name="Depto" people={people} overlay={emptyOverlay()} isAdmin={isAdmin} meId="me"
            onClose={onClose} onLeave={vi.fn()} onHide={vi.fn()} onArchive={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    )
    return { onClose, user: userEvent.setup() }
  }

  it('an administrator renames the group: it is sent to the server and only then the sheet closes', async () => {
    const { onClose, user } = open(true)
    const input = screen.getByLabelText('Nombre del grupo')
    await user.clear(input)
    await user.type(input, 'Depto Palermo')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(state.rename).toHaveBeenCalledWith({ groupId: G, name: 'Depto Palermo' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('if the server refuses it shows why and does not say "saved"', async () => {
    state.rename.mockRejectedValue({ message: 'not_group_admin' })
    const { onClose, user } = open(true)
    await user.type(screen.getByLabelText('Nombre del grupo'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/administradores/)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Nombre guardado')).toBeNull()
  })

  it('a member sees the name but cannot change it', () => {
    open(false)
    expect(screen.getByLabelText('Nombre del grupo')).toHaveAttribute('readonly')
    expect(screen.getByText(/Solo los administradores pueden cambiar el nombre/)).toBeInTheDocument()
  })
})
