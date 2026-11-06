import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddPersonSheet } from './AddPersonSheet'
import type { AddGuestResult } from './GuestsFormSheet'

type Add = (name: string, alias: string) => Promise<AddGuestResult> | AddGuestResult

function renderSheet(
  over: {
    onAddGuest?: Add
    onClose?: () => void
    onAdded?: (names: string[]) => void
    existingNames?: string[]
    single?: boolean
  } = {},
) {
  const onAddGuest = over.onAddGuest ?? vi.fn<Add>(() => true)
  const onClose = over.onClose ?? vi.fn()
  render(
    <AddPersonSheet
      code="ABC123"
      groupName="Viaje"
      onClose={onClose}
      onAddGuest={onAddGuest}
      onAdded={over.onAdded}
      existingNames={over.existingNames}
      single={over.single}
    />,
  )
  return { user: userEvent.setup(), onAddGuest, onClose }
}

async function openByName(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Agregar por nombre/ }))
}

const typeName = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.type(screen.getByLabelText('Nombre'), name)

describe('AddPersonSheet', () => {
  it('offers the two ways in: invite with a code, or add by name', () => {
    renderSheet()
    expect(screen.getByText('Invitar con código')).toBeInTheDocument()
    expect(screen.getByText('Agregar por nombre')).toBeInTheDocument()
  })

  it('adds by name only: no email, phone or account is asked for', async () => {
    const { user } = renderSheet()
    await openByName(user)
    expect(screen.getByRole('dialog', { name: 'Agregar personas' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/correo|email|teléfono|celular/i)).toBeNull()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Alias para cobrar')).toBeInTheDocument()
  })
})

describe('GuestsFormSheet: adding one or several people', () => {
  it('adds one person with the button that says how many', async () => {
    const onAdded = vi.fn()
    const { user, onAddGuest, onClose } = renderSheet({ onAdded })
    await openByName(user)
    expect(screen.getByRole('button', { name: 'Agregar personas' })).toBeDisabled()
    await typeName(user, 'Fran')
    await user.type(screen.getByLabelText('Alias para cobrar'), 'fran.mp')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(onAddGuest).toHaveBeenCalledWith('Fran', 'fran.mp')
    expect(onAdded).toHaveBeenCalledWith(['Fran'])
    expect(onClose).toHaveBeenCalled()
  })

  it('adds several people from the same window, each with its own name and alias', async () => {
    const { user, onAddGuest, onClose } = renderSheet()
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    // The first one is now a compact row; a fresh form is open.
    expect(screen.getByRole('button', { name: 'Editar a Fran' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Nombre')).toHaveLength(1)
    await typeName(user, 'Lola')
    await user.type(screen.getByLabelText('Alias para cobrar'), 'lola.cvu')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await typeName(user, 'Beto')
    expect(screen.getByRole('button', { name: 'Agregar 3 personas' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Agregar 3 personas' }))
    expect(vi.mocked(onAddGuest).mock.calls).toEqual([
      ['Fran', ''],
      ['Lola', 'lola.cvu'],
      ['Beto', ''],
    ])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a compact person can be edited again before confirming', async () => {
    const { user, onAddGuest } = renderSheet()
    await openByName(user)
    await typeName(user, 'Fra')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await typeName(user, 'Lola')
    await user.click(screen.getByRole('button', { name: 'Editar a Fra' }))
    const name = screen.getByLabelText('Nombre')
    expect(name).toHaveValue('Fra')
    await user.type(name, 'n')
    await user.click(screen.getByRole('button', { name: 'Agregar 2 personas' }))
    expect(vi.mocked(onAddGuest).mock.calls.map((c) => c[0])).toEqual(['Fran', 'Lola'])
  })

  it('a person can be removed from the list before saving', async () => {
    const { user, onAddGuest } = renderSheet()
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await typeName(user, 'Lola')
    await user.click(screen.getByRole('button', { name: 'Quitar a Fran' }))
    expect(screen.queryByRole('button', { name: 'Editar a Fran' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(vi.mocked(onAddGuest).mock.calls).toEqual([['Lola', '']])
  })

  it('cancelling stores nothing', async () => {
    const { user, onAddGuest, onClose } = renderSheet()
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onAddGuest).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled() // back to the two ways in
    expect(screen.getByText('Invitar con código')).toBeInTheDocument()
  })

  it('a couple takes one person only: no "Agregar otra persona"', async () => {
    const { user } = renderSheet({ single: true })
    await openByName(user)
    expect(screen.queryByRole('button', { name: 'Agregar otra persona' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Agregar a tu pareja' })).toBeInTheDocument()
  })

  it('keeps the explanation about people without an account, short', async () => {
    const { user } = renderSheet()
    await openByName(user)
    const note = screen.getByText(/Sin cuenta: entran en gastos y deudas/)
    expect(note.textContent?.length).toBeLessThan(200)
  })
})

describe('GuestsFormSheet: validations', () => {
  it('needs a name: the empty one is flagged next to its field and nothing is saved', async () => {
    const { user, onAddGuest } = renderSheet()
    await openByName(user)
    await user.type(screen.getByLabelText('Alias para cobrar'), 'solo.alias')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí un nombre.')
    expect(onAddGuest).not.toHaveBeenCalled()
  })

  it('refuses a person who is already in the group and lets you fix the name', async () => {
    const { user, onAddGuest } = renderSheet({ existingNames: ['Jonatan'] })
    await openByName(user)
    await typeName(user, 'jonatan')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ya hay alguien con ese nombre en el grupo.',
    )
    expect(onAddGuest).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Jonatan P')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(onAddGuest).toHaveBeenCalledWith('Jonatan P', '')
  })

  it('does not add the same person twice in the list', async () => {
    const { user, onAddGuest } = renderSheet()
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await typeName(user, ' fran ')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ya cargaste a esta persona.')
    await user.click(screen.getByRole('button', { name: 'Agregar 2 personas' }))
    expect(onAddGuest).not.toHaveBeenCalled()
  })
})

describe('GuestsFormSheet: saving', () => {
  it('shows which person could not be added, keeps every typed value, and a retry does not repeat the ones saved', async () => {
    let fail = true
    const onAddGuest = vi.fn<Add>(async (name) =>
      name === 'Lola' && fail ? 'Ya hay alguien con ese nombre en el grupo.' : true,
    )
    const onAdded = vi.fn()
    const { user, onClose } = renderSheet({ onAddGuest, onAdded })
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar otra persona' }))
    await typeName(user, 'Lola')
    await user.type(screen.getByLabelText('Alias para cobrar'), 'lola.mp')
    await user.click(screen.getByRole('button', { name: 'Agregar 2 personas' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(onAdded).toHaveBeenLastCalledWith(['Fran'])
    expect(screen.getByText(/Se agregaron 1, pero una no se pudo agregar/)).toBeInTheDocument()
    // Fran is marked as added; Lola stays open with her data and her own error.
    expect(screen.getByText('Agregada')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lola')
    expect(screen.getByLabelText('Alias para cobrar')).toHaveValue('lola.mp')
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(alerts).toContain('Ya hay alguien con ese nombre en el grupo.')

    fail = false
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    // Fran was not sent again.
    expect(vi.mocked(onAddGuest).mock.calls.map((c) => c[0])).toEqual(['Fran', 'Lola', 'Lola'])
    expect(onAdded).toHaveBeenLastCalledWith(['Lola'])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a thrown error is shown next to the person and nothing is lost', async () => {
    const onAddGuest = vi.fn<Add>(() => Promise.reject(new Error('boom')))
    const { user, onClose } = renderSheet({ onAddGuest })
    await openByName(user)
    await typeName(user, 'Fran')
    await user.click(screen.getByRole('button', { name: 'Agregar 1 persona' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Fran')
    expect(within(screen.getByRole('dialog')).getAllByRole('alert').length).toBeGreaterThan(0)
  })

  it('tapping the main button several times saves each person once', async () => {
    let release: (v: AddGuestResult) => void = () => undefined
    const onAddGuest = vi.fn<Add>(() => new Promise<AddGuestResult>((r) => (release = r)))
    const { user } = renderSheet({ onAddGuest })
    await openByName(user)
    await typeName(user, 'Fran')
    const submit = screen.getByRole('button', { name: 'Agregar 1 persona' })
    await user.click(submit)
    await user.click(screen.getByRole('button', { name: 'Agregando…' }))
    await user.keyboard('{Enter}')
    expect(onAddGuest).toHaveBeenCalledTimes(1)
    release(true)
  })
})
