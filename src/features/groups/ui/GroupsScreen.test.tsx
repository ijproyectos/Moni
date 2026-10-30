import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { GroupsScreen, type ListedGroup } from './GroupsScreen'

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

function renderScreen(onOpenDebts = vi.fn()) {
  render(
    <MemoryRouter>
      <GroupsScreen
        groups={[
          group({ myNetCents: 30_000_00 }),
          group({ id: 'g2', name: 'Brasil', kind: 'viaje', myNetCents: -12_500_00 }),
        ]}
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

describe('Grupos: the green box "Debés / Te deben"', () => {
  it('keeps showing what the person owes and is owed', () => {
    renderScreen()
    expect(screen.getByRole('button', { name: 'Ver lo que debés' })).toHaveTextContent('Debés')
    expect(screen.getByRole('button', { name: 'Ver lo que debés' })).toHaveTextContent('$12.500')
    expect(screen.getByRole('button', { name: 'Ver lo que te deben' })).toHaveTextContent(
      'Te deben',
    )
    expect(screen.getByRole('button', { name: 'Ver lo que te deben' })).toHaveTextContent('$30.000')
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

  it('the groups list below is untouched', () => {
    renderScreen()
    expect(screen.getByRole('link', { name: /Casa/ })).toHaveAttribute('href', '/grupos/g1')
    expect(screen.getByRole('link', { name: /Brasil/ })).toHaveAttribute('href', '/grupos/g2')
  })

  it('no longer has the "Mis viajes" button; "Entrar con un código" stays, on its own', () => {
    renderScreen()
    expect(screen.queryByRole('link', { name: 'Mis viajes' })).toBeNull()
    const join = screen.getByRole('link', { name: 'Entrar con un código' })
    expect(join).toHaveAttribute('href', '/grupos/unirse')
    expect(join).toHaveClass('justify-center')
  })

  it('a group of kind viaje is still a normal group in the list, with its own link', () => {
    renderScreen()
    expect(screen.getByRole('link', { name: /Brasil/ })).toHaveAttribute('href', '/grupos/g2')
  })
})
