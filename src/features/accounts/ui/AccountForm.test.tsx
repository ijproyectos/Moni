import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Category } from '@/features/categories/domain/category'
import { todayIso } from '@/shared/lib/month'
import { makeAccount } from '../domain/testing'
import { AccountForm } from './AccountForm'

const cat = (id: string, name: string): Category => ({
  id,
  name,
  kind: 'income',
  icon: 'Wallet',
  color: '#0E8A6D',
  archivedAt: null,
})
const categories = [cat('c-sueldo', 'Sueldo'), cat('c-regalos', 'Regalos')]

function setup(props: Partial<Parameters<typeof AccountForm>[0]> = {}) {
  const onSubmit = vi.fn()
  render(
    <AccountForm
      isSubmitting={false}
      submitError={null}
      onSubmit={onSubmit}
      incomeCategories={categories}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

async function fill(user: ReturnType<typeof userEvent.setup>, name: string, amount?: string) {
  await user.type(screen.getByLabelText('Nombre'), name)
  if (amount) await user.type(screen.getByLabelText('Saldo inicial'), amount)
}

const QUESTION = '¿De dónde viene esta plata?'

describe('AccountForm: where does the starting money come from', () => {
  it('asks only once there is an amount above zero', async () => {
    const { user } = setup()
    expect(screen.queryByText(QUESTION)).toBeNull()
    await user.type(screen.getByLabelText('Saldo inicial'), '0')
    expect(screen.queryByText(QUESTION)).toBeNull()
    await user.clear(screen.getByLabelText('Saldo inicial'))
    await user.type(screen.getByLabelText('Saldo inicial'), '200000')
    expect(screen.getByRole('radiogroup', { name: QUESTION })).toBeInTheDocument()
  })

  it('offers the three options and starts on "Dinero que ya tenía"', async () => {
    const { user } = setup()
    await fill(user, 'Galicia', '200000')
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Dinero que ya tenía'),
      expect.stringContaining('Mi sueldo'),
      expect.stringContaining('Otro ingreso'),
    ])
    expect(screen.getByRole('radio', { name: /Dinero que ya tenía/ })).toBeChecked()
    expect(screen.queryByLabelText('Fecha del ingreso')).toBeNull()
  })

  it('saves the default as money the person already had (no category, no date asked)', async () => {
    const { user, onSubmit } = setup()
    await fill(user, 'Galicia', '200000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Galicia',
      kind: 'cash',
      openingBalance: 200_000_00,
    })
    expect(onSubmit.mock.calls[0]?.[1]).toMatchObject({ source: 'previous', categoryId: null })
  })

  it('"Mi sueldo" uses the Sueldo category and lets the person choose the date', async () => {
    const { user, onSubmit } = setup()
    await fill(user, 'Galicia', '200000')
    await user.click(screen.getByRole('radio', { name: /Mi sueldo/ }))
    const date = screen.getByLabelText('Fecha del ingreso')
    expect(date).toHaveValue(todayIso())
    // The category is fixed to Sueldo: no chips to pick from.
    expect(screen.queryByRole('button', { name: 'Regalos' })).toBeNull()
    await user.clear(date)
    await user.type(date, '2026-10-05')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      source: 'salary',
      categoryId: 'c-sueldo',
      occurredOn: '2026-10-05',
    })
  })

  it('"Otro ingreso" needs an existing category and the date', async () => {
    const { user, onSubmit } = setup()
    await fill(user, 'Galicia', '50000')
    await user.click(screen.getByRole('radio', { name: /Otro ingreso/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí una categoría')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Regalos' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[1]).toMatchObject({
      source: 'other',
      categoryId: 'c-regalos',
      occurredOn: todayIso(),
    })
  })

  it('"Mi sueldo" falls back to picking a category when the person has no Sueldo category', async () => {
    const { user } = setup({ incomeCategories: [cat('c-regalos', 'Regalos')] })
    await fill(user, 'Galicia', '1000')
    await user.click(screen.getByRole('radio', { name: /Mi sueldo/ }))
    expect(screen.getByRole('button', { name: 'Regalos' })).toBeInTheDocument()
  })

  it('does not ask for a credit card: its starting debt keeps its own logic', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Tarjeta' }))
    expect(screen.getByLabelText('Deuda inicial')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), 'Visa')
    await user.type(screen.getByLabelText('Deuda inicial'), '30000')
    expect(screen.queryByText(QUESTION)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: 'credit_card',
      openingBalance: 30_000_00,
    })
  })

  it('does not ask when editing an account that already exists', () => {
    setup({
      initial: makeAccount({
        id: 'g',
        name: 'Galicia',
        kind: 'bank',
        openingBalanceCents: 200_000_00,
      }),
    })
    expect(screen.queryByText(QUESTION)).toBeNull()
  })

  it('editing an account whose balance is already a movement hides the starting balance field', () => {
    setup({
      initial: makeAccount({ id: 'g', name: 'Galicia', kind: 'bank', balanceCents: 200_000_00 }),
    })
    expect(screen.queryByLabelText('Saldo inicial')).toBeNull()
  })
})

describe('AccountForm: Agregar rápido (banks, wallets and cards)', () => {
  it('shows a chip for each catalog brand when creating', () => {
    setup()
    const chips = screen.getByText('Agregar rápido').parentElement as HTMLElement
    const names = Array.from(chips.querySelectorAll('li button')).map(
      (b) => b.lastChild?.textContent,
    )
    expect(names).toEqual([
      'Ualá',
      'Cuenta DNI',
      'Brubank',
      'Lemon',
      'Naranja X',
      'BBVA',
      'Banco Nación',
      'Macro',
      'ICBC',
      'HSBC',
      'Banco Provincia',
      'Visa',
      'Mastercard',
      'Amex',
      'Mercado Pago',
      'Galicia',
      'Santander',
    ])
  })

  it('does not show them when editing an existing account', () => {
    setup({ initial: makeAccount({ id: 'g', name: 'Galicia', kind: 'bank' }) })
    expect(screen.queryByText('Agregar rápido')).toBeNull()
  })

  it('a bank chip prefills the name and the bank type, both still editable', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Galicia' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Galicia')
    expect(screen.getByRole('button', { name: 'Banco' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Nombre'), ' sueldo')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ name: 'Galicia sueldo', kind: 'bank' })
  })

  it('a wallet chip prefills the wallet type', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Mercado Pago' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Mercado Pago')
    expect(screen.getByRole('button', { name: 'Billetera' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('a card chip switches the form to credit-card mode (limit, closing and due day)', async () => {
    const { user, onSubmit } = setup()
    expect(screen.queryByLabelText('Límite de crédito')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Visa' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Visa')
    expect(screen.getByLabelText('Límite de crédito')).toBeInTheDocument()
    expect(screen.getByLabelText('Día de cierre')).toBeInTheDocument()
    expect(screen.getByLabelText('Día de vencimiento')).toBeInTheDocument()
    expect(screen.getByLabelText('Deuda inicial')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Día de cierre'), '25')
    await user.type(screen.getByLabelText('Día de vencimiento'), '5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Visa',
      kind: 'credit_card',
      closingDay: 25,
      dueDay: 5,
    })
  })

  it('switching from a card chip to a bank chip leaves credit-card mode', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Mastercard' }))
    expect(screen.getByLabelText('Límite de crédito')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Santander' }))
    expect(screen.queryByLabelText('Límite de crédito')).toBeNull()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Santander')
  })

  it('shows the official logo when the brand has one and an initials avatar when it is pending', () => {
    setup()
    const visa = screen.getByRole('button', { name: 'Visa' })
    expect(visa.querySelector('img')).not.toBeNull()
    const galicia = screen.getByRole('button', { name: 'Galicia' })
    expect(galicia.querySelector('img')).toBeNull()
    expect(galicia.querySelector('[data-testid="brand-initials"]')).toHaveTextContent('GA')
  })
})
