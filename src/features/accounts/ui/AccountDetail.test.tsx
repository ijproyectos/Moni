import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import type { Account } from '../domain/account'
import { AccountDetail, type AccountDetailProps } from './AccountDetail'

const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const adjust = vi.hoisted(() => vi.fn().mockResolvedValue(0))
const updateTransfer = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../api/useAccounts', () => ({
  useUpdateAccount: () => ({ mutateAsync: update, isPending: false }),
  useAdjustAccountBalance: () => ({ mutateAsync: adjust, isPending: false }),
  useUpdateTransferData: () => ({ mutateAsync: updateTransfer, isPending: false }),
  useClassifyOpeningBalance: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function setup(account: Account, props: Partial<AccountDetailProps> = {}) {
  const handlers = { onClose: vi.fn(), onDelete: vi.fn(), onPayCard: vi.fn() }
  render(
    <MemoryRouter>
      <ToastProvider>
        <AccountDetail
          account={account}
          tone="bg-forest text-cream"
          origin={{ top: 200, height: 96 }}
          incomeCategories={[]}
          canDelete
          canPayCard
          {...handlers}
          {...props}
        />
      </ToastProvider>
    </MemoryRouter>,
  )
  return { ...handlers, user: userEvent.setup() }
}

const galicia = makeAccount({ id: 'g', name: 'Galicia', kind: 'bank', balanceCents: 150_000_00 })

beforeEach(() => {
  update.mockClear()
  adjust.mockClear()
  updateTransfer.mockClear()
})

describe('AccountDetail', () => {
  it('shows the same card, big: name, type and current balance', () => {
    setup(galicia)
    const hero = screen.getByTestId('account-hero')
    // Galicia is a catalog bank: it wears its own identity, not Moni's color of the list.
    expect(hero).not.toHaveClass('bg-forest')
    expect(hero.style.background).toContain('linear-gradient')
    expect(hero.querySelector('svg[data-art="bubbles"]')).not.toBeNull()
    expect(within(hero).getByRole('heading', { name: 'Galicia' })).toBeVisible()
    expect(hero).toHaveTextContent('Banco')
    expect(hero).toHaveTextContent('$150.000')
  })

  it('under the card there is only the name, the balance and a quiet delete', () => {
    setup(galicia)
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ajustar saldo' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Eliminar medio de pago' })).toBeVisible()
    // The type selector (Efectivo / Banco / Billetera / Tarjeta) is not part of an existing medium.
    expect(screen.queryByRole('group', { name: 'Tipo de cuenta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Billetera' })).toBeNull()
    // Nothing to save until something is being edited.
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('Editar shows Guardar / Cancelar, and saves only the new name (same type, same starting balance)', async () => {
    const { user } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const input = screen.getByLabelText('Nombre del medio de pago')
    expect(input).toHaveValue('Galicia')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible()
    await user.clear(input)
    await user.type(input, 'Galicia sueldo')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: 'g',
      previousKind: 'bank',
      values: { name: 'Galicia sueldo', kind: 'bank', openingBalance: galicia.openingBalanceCents },
    })
    // Back to the quiet view.
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
  })

  it('Cancelar leaves everything as it was', async () => {
    const { user } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.type(screen.getByLabelText('Nombre del medio de pago'), ' nuevo')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText('Galicia', { selector: 'p' })).toBeVisible()
  })

  it('does not accept an empty name', async () => {
    const { user } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Nombre del medio de pago'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ponele un nombre a la cuenta.')
    expect(update).not.toHaveBeenCalled()
  })

  it('Ajustar saldo takes the real balance and records only the difference (no income, no expense)', async () => {
    const { user } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Ajustar saldo' }))
    const input = screen.getByLabelText('Saldo real')
    expect(input).toHaveValue('150.000')
    await user.clear(input)
    await user.type(input, '148000')
    // The opening button gives way to the one that confirms.
    await user.click(screen.getByRole('button', { name: 'Ajustar saldo' }))
    expect(adjust).toHaveBeenCalledWith({ id: 'g', targetCents: 148_000_00 })
  })

  it('Ajustar saldo can be dismissed without changing anything', async () => {
    const { user } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Ajustar saldo' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(adjust).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Saldo real')).toBeNull()
  })

  it("Eliminar medio de pago only asks (the confirmation is the page's)", async () => {
    const { user, onDelete } = setup(galicia)
    await user.click(screen.getByRole('button', { name: 'Eliminar medio de pago' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('the last medium cannot be deleted', () => {
    setup(galicia, { canDelete: false })
    expect(screen.queryByRole('button', { name: 'Eliminar medio de pago' })).toBeNull()
  })

  it('closes with Volver and with Escape', async () => {
    const first = setup(galicia)
    await first.user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(first.onClose).toHaveBeenCalledTimes(1)
    const second = setup(galicia)
    await second.user.keyboard('{Escape}')
    expect(second.onClose).toHaveBeenCalled()
  })

  it('a credit card shows its debt and available credit, edits its limit and days, and can be paid', async () => {
    const visa = makeAccount({
      id: 'v',
      name: 'Visa',
      kind: 'credit_card',
      balanceCents: -40_000_00,
      creditLimitCents: 200_000_00,
      closingDay: 25,
      dueDay: 5,
    })
    const { user, onPayCard } = setup(visa)
    const hero = screen.getByTestId('account-hero')
    expect(hero).toHaveTextContent('Deuda')
    expect(hero).toHaveTextContent('$40.000')
    expect(hero).toHaveTextContent('Disponible $160.000')
    expect(screen.getByRole('link', { name: 'Ver resumen y cuotas' })).toHaveAttribute(
      'href',
      '/tarjetas',
    )
    await user.click(screen.getByRole('button', { name: 'Pagar tarjeta' }))
    expect(onPayCard).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Límite de crédito')).toHaveValue('200.000')
    await user.clear(screen.getByLabelText('Día de cierre'))
    await user.type(screen.getByLabelText('Día de cierre'), '27')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      values: { kind: 'credit_card', creditLimit: 200_000_00, closingDay: 27, dueDay: 5 },
    })
  })

  it('shows what the goals reserve in the account', () => {
    setup(galicia, { reserve: { reservedCents: 50_000_00, freeCents: 100_000_00 } })
    expect(screen.getByTestId('account-hero')).toHaveTextContent(
      'Reservado para metas $50.000 · libre $100.000',
    )
  })

  describe('Datos para transferencias', () => {
    const withData = makeAccount({
      id: 'g',
      name: 'Galicia',
      kind: 'bank',
      balanceCents: 150_000_00,
      transferAlias: 'galicia.sueldo',
      transferCbu: '0070000030000012345678',
    })

    it('a bank without data invites to add it, and says it is optional', () => {
      setup(galicia)
      expect(screen.getByText('Datos para transferencias')).toBeVisible()
      expect(screen.getByText(/Son opcionales/)).toBeVisible()
      expect(screen.getByRole('button', { name: 'Agregar' })).toBeVisible()
    })

    it('shows the alias and the CBU that are saved, with the reminder that nothing is shared by itself', () => {
      setup(withData)
      expect(screen.getByText('galicia.sueldo')).toBeVisible()
      expect(screen.getByText('0070000030000012345678')).toBeVisible()
      expect(screen.getByText('CBU')).toBeVisible()
      expect(
        screen.getByText('Solo se comparten si vos elegís incluirlos en un resumen.'),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: 'Copiar alias' })).toBeVisible()
    })

    it('a wallet says CVU, not CBU', () => {
      setup(
        makeAccount({
          id: 'm',
          name: 'Mercado Pago',
          kind: 'wallet',
          transferCbu: '0000003100012345678901',
        }),
      )
      expect(screen.getByText('CVU')).toBeVisible()
      expect(screen.queryByText('CBU')).toBeNull()
    })

    it('cash and credit cards have no such section', () => {
      const first = render(
        <MemoryRouter>
          <ToastProvider>
            <AccountDetail
              account={makeAccount({ id: 'c', name: 'Efectivo', kind: 'cash' })}
              tone="bg-forest text-cream"
              origin={{ top: 0, height: 96 }}
              incomeCategories={[]}
              canDelete
              canPayCard
              onClose={vi.fn()}
              onDelete={vi.fn()}
              onPayCard={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>,
      )
      expect(screen.queryByText('Datos para transferencias')).toBeNull()
      first.unmount()
      setup(makeAccount({ id: 'v', name: 'Visa', kind: 'credit_card', balanceCents: -1000 }))
      expect(screen.queryByText('Datos para transferencias')).toBeNull()
    })

    it('saves the alias and the CBU (spaces allowed) touching nothing else', async () => {
      const { user } = setup(galicia)
      await user.click(screen.getByRole('button', { name: 'Agregar' }))
      await user.type(screen.getByLabelText('Alias'), 'galicia.sueldo')
      await user.type(screen.getByLabelText('CBU'), '0070 0000 3000 0012 3456 78')
      await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0] as HTMLElement)
      expect(updateTransfer).toHaveBeenCalledWith({
        id: 'g',
        data: { alias: 'galicia.sueldo', cbu: '0070000030000012345678' },
      })
      expect(update).not.toHaveBeenCalled()
      expect(adjust).not.toHaveBeenCalled()
    })

    it('both fields are optional: only an alias is fine, and an empty field clears it', async () => {
      const { user } = setup(withData)
      const section = screen
        .getByText('Datos para transferencias')
        .closest('section') as HTMLElement
      await user.click(within(section).getByRole('button', { name: 'Editar' }))
      await user.clear(screen.getByLabelText('CBU'))
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(updateTransfer).toHaveBeenCalledWith({
        id: 'g',
        data: { alias: 'galicia.sueldo', cbu: null },
      })
    })

    it.each([
      [
        'corto',
        '',
        'Alias: El alias tiene entre 6 y 20 caracteres: letras, números, puntos o guiones.',
      ],
      ['alias.valido', '123', 'CBU: Tiene que tener 22 números.'],
    ])('validates before saving (%s / %s)', async (alias, cbu, message) => {
      const { user } = setup(galicia)
      await user.click(screen.getByRole('button', { name: 'Agregar' }))
      await user.type(screen.getByLabelText('Alias'), alias)
      if (cbu) await user.type(screen.getByLabelText('CBU'), cbu)
      await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0] as HTMLElement)
      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(updateTransfer).not.toHaveBeenCalled()
    })

    it('Cancelar discards what was typed', async () => {
      const { user } = setup(galicia)
      await user.click(screen.getByRole('button', { name: 'Agregar' }))
      await user.type(screen.getByLabelText('Alias'), 'algo.largo')
      await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0] as HTMLElement)
      expect(updateTransfer).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Alias')).toBeNull()
    })
  })
})
