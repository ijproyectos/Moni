import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { selectableGroups } from '../domain/groupView'
import { GroupPicker, type PickableGroup } from './GroupPicker'

vi.mock('../api/useGroupPhotos', () => ({ useGroupPhotos: () => ({ g1: { path: 'p', url: 'https://example.test/foto.jpg' } }) }))

const group = (i: number, over: Partial<PickableGroup> = {}): PickableGroup => ({ id: `g${i}`, name: `Grupo ${i}`, kind: 'amigos', memberCount: i, ...over })
const five = [1, 2, 3, 4, 5].map((i) => group(i))

function setup(groups: readonly PickableGroup[], selectedId: string | null = null) {
  const onSelect = vi.fn()
  render(<GroupPicker groups={groups} selectedId={selectedId} onSelect={onSelect} empty="No hay grupos. Creá uno nuevo." />)
  return { onSelect, user: userEvent.setup() }
}

describe('GroupPicker', () => {
  it('shows only 3 groups at first, with their member count, and «Ver más grupos» when there are more', () => {
    setup(five)
    const list = screen.getByRole('group', { name: 'Tus grupos' })
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    expect(within(list).getByRole('button', { name: /Grupo 2/ })).toHaveTextContent('2 personas')
    expect(within(list).getByRole('button', { name: /Grupo 1/ })).toHaveTextContent('1 persona')
    expect(screen.getByRole('button', { name: 'Ver más grupos' })).toBeVisible()
  })

  it('with 3 or fewer there is no «Ver más grupos»', () => {
    setup(five.slice(0, 3))
    expect(screen.queryByRole('button', { name: 'Ver más grupos' })).toBeNull()
  })

  it('«Ver más grupos» lists all of them with a search by name (accents and case do not matter)', async () => {
    const { user, onSelect } = setup([...five.slice(0, 4), group(5, { name: 'Cumpleaños de María' })])
    await user.click(screen.getByRole('button', { name: 'Ver más grupos' }))
    const dialog = screen.getByRole('dialog', { name: 'Tus grupos' })
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThanOrEqual(5)
    await user.type(within(dialog).getByLabelText('Buscar entre tus grupos'), 'maria')
    expect(within(dialog).getAllByRole('button', { name: /Cumpleaños de María/ })).toHaveLength(1)
    expect(within(dialog).queryByRole('button', { name: /Grupo 1/ })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /Cumpleaños de María/ }))
    expect(onSelect).toHaveBeenCalledWith('g5')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a group beyond the first three that is selected stays in sight', () => {
    setup(five, 'g5')
    const list = screen.getByRole('group', { name: 'Tus grupos' })
    expect(within(list).getByRole('button', { name: /Grupo 5/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(list).getAllByRole('button')).toHaveLength(3)
  })

  it('shows the group photo when it has one', () => {
    setup(five)
    expect(document.querySelector('img[src="https://example.test/foto.jpg"]')).not.toBeNull()
  })

  it('with no groups it invites to create one', () => {
    setup([])
    expect(screen.getByText('No hay grupos. Creá uno nuevo.')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Tus grupos' })).toBeNull()
  })
})

describe('selectableGroups', () => {
  it('leaves out the groups I removed from my list, most recent activity first; a restored one comes back', () => {
    const list = [
      { id: 'a', hiddenAt: null, lastActivity: '2026-11-01T00:00:00Z' },
      { id: 'b', hiddenAt: '2026-11-05T00:00:00Z', lastActivity: '2026-11-20T00:00:00Z' },
      { id: 'c', hiddenAt: null, lastActivity: '2026-11-10T00:00:00Z' },
    ]
    expect(selectableGroups(list).map((g) => g.id)).toEqual(['c', 'a'])
    expect(selectableGroups(list.map((g) => (g.id === 'b' ? { ...g, hiddenAt: null } : g))).map((g) => g.id)).toEqual(['b', 'c', 'a'])
  })
})
