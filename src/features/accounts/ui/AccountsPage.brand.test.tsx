import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet' }),
      makeAccount({ id: 'galicia', name: 'galicia', kind: 'bank' }),
      makeAccount({ id: 'sueldo', name: 'Galicia sueldo', kind: 'bank' }),
      makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' }),
      makeAccount({ id: 'brubank', name: 'Mi billetera', kind: 'wallet', transferAlias: 'iara.moni' }),
    ],
  }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({ useSavings: () => ({ data: undefined }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/mpImport/ui/MpImportSection', () => ({ MpImportSection: () => null }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
}))

function row(name: string) {
  const list = screen.getByRole('list', { name: 'Cuentas y billeteras' })
  return within(list).getByRole('button', { name: `Abrir ${name}` })
}

describe('Medios de pago: stacked cards', () => {
  it('a back card comes to the front when tapped, without opening its detail', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountsPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    const frontOf = () => screen.getByRole('list', { name: 'Cuentas y billeteras' }).querySelector('li[data-front]')
    expect(frontOf()).toContainElement(row('Mi billetera'))
    await userEvent.click(row('galicia'))
    expect(frontOf()).toContainElement(row('galicia'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Medios de pago: visual cards', () => {
  it('each medium is a card with its own color, entity, alias and balance', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountsPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    const galicia = row('galicia').closest('[data-account-card]') as HTMLElement
    expect(galicia.style.background).toContain('gradient')
    expect(row('galicia')).toHaveTextContent('Entidad: Galicia')
    expect(row('Mi billetera')).toHaveTextContent('Alias: iara.moni')
    expect((row('Efectivo').closest('[data-account-card]') as HTMLElement).className).toContain('bg-')
  })
})

describe('Medios de pago: brand avatar by catalog match', () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountsPage />
        </ToastProvider>
      </MemoryRouter>,
    )
  })

  it('shows the official logo for an account named like a brand that has one', () => {
    expect(row('Mercado Pago').querySelector('img')?.getAttribute('src')).toMatch(
      /mercadopago.*\.svg/,
    )
  })

  it('shows the brand emblem of the entity when the logo is pending (match ignores case)', () => {
    const badge = within(row('galicia')).getByTestId('brand-badge')
    expect(badge).toHaveTextContent('G')
    expect(row('galicia').querySelector('img')).toBeNull()
  })

  it('shows no avatar when the name is not exactly a catalog brand', () => {
    expect(within(row('Galicia sueldo')).queryByTestId('brand-initials')).toBeNull()
    expect(row('Galicia sueldo').querySelector('img')).toBeNull()
    expect(within(row('Efectivo')).queryByTestId('brand-initials')).toBeNull()
  })
})
