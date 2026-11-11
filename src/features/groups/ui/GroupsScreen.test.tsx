import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ShoppingCart } from 'lucide-react'
import { GroupsScreen, type LastExpenseRow, type ListedGroup } from './GroupsScreen'

const group = (over: Partial<ListedGroup> = {}): ListedGroup => ({
  id: 'g1',
  name: 'Casa',
  kind: 'casa',
  role: 'owner',
  memberCount: 3,
  myNetCents: 0,
  lastActivity: '2026-10-01T00:00:00Z',
  peopleCount: 3,
  ...over,
})

function renderScreen(
  onOpenDebts = vi.fn(),
  groups: ListedGroup[] = [
    group({ myNetCents: 30_000_00 }),
    group({ id: 'g2', name: 'Brasil', kind: 'viaje', myNetCents: -12_500_00 }),
  ],
  lastExpense?: LastExpenseRow,
) {
  render(
    <MemoryRouter>
      <GroupsScreen
        groups={groups}
        lastExpense={lastExpense}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        onNewGroup={vi.fn()}
        onOpenDebts={onOpenDebts}
      />
    </MemoryRouter>,
  )
  return { onOpenDebts, user: userEvent.setup() }
}

describe('Grupos: the green hero "Te deben" / "Debés"', () => {
  it('shows what the person is owed in the hero and what they owe below', () => {
    renderScreen()
    const owed = screen.getByRole('button', { name: 'Ver lo que te deben' })
    expect(owed).toHaveTextContent('Te deben')
    expect(owed).toHaveTextContent('+$30.000')
    const owe = screen.getByRole('button', { name: 'Ver lo que debés' })
    expect(owe).toHaveTextContent('Debés')
    expect(owe).toHaveTextContent('$12.500')
  })

  it('shows the cents with a comma, smaller', () => {
    renderScreen(vi.fn(), [group({ myNetCents: 57_729_065 })])
    expect(screen.getByRole('button', { name: 'Ver lo que te deben' })).toHaveTextContent(
      '+$577.290,65',
    )
  })

  it('says "$0 · sin deudas" when nothing is owed', () => {
    renderScreen(vi.fn(), [group({ myNetCents: 100 })])
    expect(screen.getByRole('button', { name: 'Ver lo que debés' })).toHaveTextContent(
      '$0 · sin deudas',
    )
  })

  it('tapping "Debés" opens the debts on the "Debo" tab', async () => {
    const { user, onOpenDebts } = renderScreen()
    await user.click(screen.getByRole('button', { name: 'Ver lo que debés' }))
    expect(onOpenDebts).toHaveBeenCalledWith('owe')
  })

  it('tapping "Te deben" opens the debts on the "Me deben" tab', async () => {
    const { user, onOpenDebts } = renderScreen()
    await user.click(screen.getByRole('button', { name: 'Ver lo que te deben' }))
    expect(onOpenDebts).toHaveBeenCalledWith('owed')
  })

  it('lists the groups with their balance and links', () => {
    renderScreen()
    expect(screen.getByRole('link', { name: /Casa/ })).toHaveAttribute('href', '/grupos/g1')
    expect(screen.getByRole('link', { name: /Casa/ })).toHaveTextContent('te deben')
    expect(screen.getByRole('link', { name: /Brasil/ })).toHaveAttribute('href', '/grupos/g2')
    expect(screen.getByRole('link', { name: /Brasil/ })).toHaveTextContent('debés')
  })

  it('has "Crear grupo" and "Entrar con código" side by side; no "Mis viajes"', () => {
    renderScreen()
    expect(screen.queryByRole('link', { name: 'Mis viajes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Crear grupo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar con código' })).toHaveAttribute(
      'href',
      '/grupos/unirse',
    )
  })

  it('"Último en <grupo>" only shows with a real last expense', () => {
    renderScreen()
    expect(screen.queryByText(/Último en/)).toBeNull()
  })

  it('shows the last real expense of the group', () => {
    renderScreen(vi.fn(), undefined, {
      groupName: 'Casa',
      description: 'Coto · dividido 50/50',
      meta: 'Pagaste vos · ayer',
      deltaCents: 1_936_000,
      icon: ShoppingCart,
    })
    expect(screen.getByRole('heading', { name: 'Último en Casa' })).toBeInTheDocument()
    expect(screen.getByText('Pagaste vos · ayer')).toBeInTheDocument()
    expect(screen.getByText('+$19.360')).toBeInTheDocument()
  })

  it('the empty state invites to create a group or to enter with a code', () => {
    render(
      <MemoryRouter>
        <GroupsScreen groups={[]} isLoading={false} isError={false} onRetry={vi.fn()} onNewGroup={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Todavía no compartís gastos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear grupo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar con un código' })).toHaveAttribute('href', '/grupos/unirse')
  })
})
