import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeAccount } from '@/features/accounts/domain/testing'
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

  it('offers only the shared split methods and a single payer when it cannot store records for people without an account', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Iguales' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Porcentaje' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Montos' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pagaron varios/ })).toBeNull()
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
    expect(screen.getByText('Suman 100%. Listo.')).toBeInTheDocument()

    const beto = screen.getByLabelText('Porcentaje de Beto')
    await user.clear(beto)
    await user.type(beto, '20')
    expect(screen.getByText('Suman 86,67% de 100%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByText('Los porcentajes tienen que sumar 100.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    const dani = screen.getByLabelText('Porcentaje de Dani')
    await user.clear(dani)
    await user.type(dani, '46,66')
    expect(screen.getByText('Suman 100%. Listo.')).toBeInTheDocument()
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
    for (const name of ['Vos', 'Beto', 'Dani']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(
      await screen.findByText('Elegí al menos una persona.', { selector: '[role=alert]' }),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  describe('con alguien sin cuenta', () => {
    const FRAN = 'guest-fran'
    function setupGuest() {
      const onSubmit = vi.fn()
      const onSubmitSimulated = vi.fn()
      render(
        <SharedExpenseForm
          members={members}
          meId={ME}
          templates={[]}
          accounts={[makeAccount({ id: 'gal', name: 'Galicia', kind: 'bank' })]}
          guests={[{ id: FRAN, name: 'Fran', alias: '' }]}
          isSubmitting={false}
          submitError={null}
          onSubmit={onSubmit}
          onSubmitSimulated={onSubmitSimulated}
        />,
      )
      return { onSubmit, onSubmitSimulated, user: userEvent.setup() }
    }

    it('lets the payer take the whole amount from their own account, sent once', async () => {
      const { user, onSubmit, onSubmitSimulated } = setupGuest()
      await user.type(screen.getByLabelText('Monto'), '100')
      await user.type(screen.getByLabelText('Descripción'), 'Cena')
      await user.click(screen.getByRole('button', { name: /Fecha, categoría y cuenta/ }))
      await user.selectOptions(screen.getByRole('combobox', { name: /Pagado desde/ }), 'gal')
      await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
      await waitFor(() => expect(onSubmitSimulated).toHaveBeenCalledTimes(1))
      expect(onSubmit).not.toHaveBeenCalled()
      const sent = onSubmitSimulated.mock.calls[0]?.[0]
      expect(sent).toMatchObject({
        amountCents: 10_000,
        payerAccountId: 'gal',
        payers: [{ personId: ME, cents: 10_000 }],
      })
      expect(
        sent.shares
          .map((x: { cents: number }) => x.cents)
          .reduce((a: number, b: number) => a + b, 0),
      ).toBe(10_000)
    })

    it('sends no account when none is chosen', async () => {
      const { user, onSubmitSimulated } = setupGuest()
      await user.type(screen.getByLabelText('Monto'), '100')
      await user.type(screen.getByLabelText('Descripción'), 'Cena')
      await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
      await waitFor(() => expect(onSubmitSimulated).toHaveBeenCalled())
      expect(onSubmitSimulated.mock.calls[0]?.[0].payerAccountId).toBeNull()
    })

    it('does not talk about "este dispositivo": it is stored in the group', async () => {
      const { user } = setupGuest()
      await user.type(screen.getByLabelText('Monto'), '100')
      expect(screen.queryByText(/este dispositivo/)).toBeNull()
    })
  })
})
