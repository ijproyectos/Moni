import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GroupMember } from '../domain/group'
import { SharedExpenseForm } from './SharedExpenseForm'

const ME = '00000000-0000-4000-8000-00000000000a'
const BETO = '00000000-0000-4000-8000-00000000000b'
const DANI = '00000000-0000-4000-8000-00000000000c'

const member = (userId: string, displayName: string): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-01T00:00:00Z',
  leftAt: null,
})
const members = [member(ME, 'Ana'), member(BETO, 'Beto'), member(DANI, 'Dani')]

function setup() {
  const onSubmit = vi.fn()
  render(
    <SharedExpenseForm
      members={members}
      meId={ME}
      templates={[]}
      accounts={[]}
      isSubmitting={false}
      submitError={null}
      onSubmit={onSubmit}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('SharedExpenseForm', () => {
  it('previews an equal split of 100 with the extra cent on the payer', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Monto'), '100')
    const [first, second, third] = screen.getAllByRole('listitem')
    expect(within(first as HTMLElement).getByText('$33,34')).toBeInTheDocument()
    expect(within(second as HTMLElement).getByText('$33,33')).toBeInTheDocument()
    expect(within(third as HTMLElement).getByText('$33,33')).toBeInTheDocument()
  })

  it('submits integer cents and the participants', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Monto'), '100')
    await user.type(screen.getByLabelText('Descripción'), 'Cena')
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      amount: 10_000,
      description: 'Cena',
      paidBy: ME,
      splitMethod: 'equal',
      participants: [ME, BETO, DANI],
      percentValues: null,
      payerAccountId: null,
    })
  })

  it('requires percentages to reach 100 and submits them when they do', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Monto'), '100')
    await user.type(screen.getByLabelText('Descripción'), 'Super')
    await user.click(screen.getByRole('button', { name: 'Porcentaje' }))
    expect(screen.getByText('Suma 100% de 100%')).toBeInTheDocument()

    const beto = screen.getByLabelText('Porcentaje de Beto')
    await user.clear(beto)
    await user.type(beto, '20')
    expect(screen.getByText('Suma 86,67% de 100%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByText('Los porcentajes tienen que sumar 100.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    const dani = screen.getByLabelText('Porcentaje de Dani')
    await user.clear(dani)
    await user.type(dani, '46,66')
    expect(screen.getByText('Suma 100% de 100%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      splitMethod: 'percent',
      percentValues: [33.34, 20, 46.66],
    })
  })

  it('requires at least one participant', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Monto'), '10')
    await user.type(screen.getByLabelText('Descripción'), 'Algo')
    for (const name of ['Ana (vos)', 'Beto', 'Dani']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(
      await screen.findByText('Elegí al menos una persona.', { selector: '[role=alert]' }),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
