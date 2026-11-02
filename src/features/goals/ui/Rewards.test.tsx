import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Rewards } from '../api/rewardsRepository'
import { earnedOn } from '../domain/earnedOn'
import { AchievementsPage } from './AchievementsPage'
import { AchievementsRow } from './AchievementsRow'
import { RewardCelebration } from './RewardCelebration'

const state = vi.hoisted(() => ({
  rewards: { isLoading: false, isError: false, data: undefined as unknown },
  markSeen: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('../api/useSavings', () => ({
  useRewards: () => ({ ...state.rewards, refetch: state.refetch }),
  useMarkRewardsSeen: () => ({ mutate: state.markSeen, isPending: false }),
}))

const badge = (key: string, over = {}) => ({
  key,
  goalName: 'Computadora',
  targetCents: 3_000_000_00,
  earnedAt: '2027-01-15T15:00:00Z',
  seen: true,
  ...over,
})
const achievement = (over = {}) => ({
  id: 'a1',
  goalId: 'g1',
  goalName: 'Computadora',
  targetCents: 3_000_000_00,
  reachedAt: '2027-01-15T15:00:00Z',
  seen: true,
  ...over,
})
const set = (r: Partial<Rewards>) => {
  state.rewards = { isLoading: false, isError: false, data: { badges: [], achievements: [], ...r } }
}

beforeEach(() => {
  state.markSeen.mockReset()
  set({})
})

function page() {
  render(
    <MemoryRouter>
      <AchievementsPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Mis logros', () => {
  it('shows "3 de 10 insignias" with only what was really earned', () => {
    set({ badges: [badge('primer-aporte'), badge('primera-meta'), badge('mitad-del-camino')] })
    page()
    expect(screen.getByText(/3 de 10/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Primera meta cumplida, conseguida/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /bloqueada/ })).toHaveLength(7)
  })

  it('the cards only show the picture and the name: no goal, date or long text', () => {
    set({ badges: [badge('primera-meta')] })
    page()
    const earned = screen.getByRole('button', { name: /Primera meta cumplida, conseguida/ })
    expect(earned).toHaveTextContent(/^Primera meta cumplida$/)
    expect(earned).not.toHaveTextContent('Computadora')
    expect(earned).not.toHaveTextContent('2027')
    const locked = screen.getByRole('button', { name: /Lluvia de monedas, bloqueada/ })
    expect(locked).toHaveTextContent(/^Lluvia de monedas$/)
    expect(locked).not.toHaveTextContent('Cumplí 3 metas')
  })

  it('is a compact grid of three columns', () => {
    page()
    expect(screen.getAllByRole('button', { name: /bloqueada/ })[0]?.closest('ul')).toHaveClass(
      'grid-cols-3',
    )
  })

  it('a locked badge explains how to unlock it, and is not shown as earned', () => {
    page()
    expect(screen.getByText(/Todavía no conseguiste ninguna/)).toBeInTheDocument()
    expect(screen.getByText(/0 de 10/)).toBeInTheDocument()
    const locked = screen.getByRole('button', {
      name: /Lluvia de monedas, bloqueada\. Cumplí 3 metas\./,
    })
    expect(locked).not.toHaveTextContent('Cumplí 3 metas.')
  })

  it('tapping an earned badge opens its detail with a congratulation, goal, amount and date', async () => {
    set({ badges: [badge('primera-meta')] })
    const user = page()
    await user.click(screen.getByRole('button', { name: /Primera meta cumplida, conseguida/ }))
    const dialog = screen.getByRole('dialog', { name: 'Primera meta cumplida' })
    expect(dialog).toHaveTextContent('¡Lo lograste! Tu primera meta ya es realidad.')
    expect(dialog).toHaveTextContent('Meta')
    expect(dialog).toHaveTextContent('Computadora')
    expect(dialog).toHaveTextContent('Objetivo alcanzado')
    expect(dialog).toHaveTextContent('$3.000.000')
    expect(dialog).toHaveTextContent('Conseguida')
    expect(dialog).toHaveTextContent('15 de enero de 2027')
  })

  it('tapping a locked badge says it is not earned yet and how to get it', async () => {
    const user = page()
    await user.click(screen.getByRole('button', { name: /Racha de ahorro, bloqueada/ }))
    const dialog = screen.getByRole('dialog', { name: 'Racha de ahorro' })
    expect(dialog).toHaveTextContent('Todavía no la conseguiste')
    expect(dialog).toHaveTextContent('Aportá a tus metas tres meses seguidos.')
    expect(dialog).not.toHaveTextContent('Conseguida')
  })

  it('a badge whose goal no longer exists still shows, without private details it does not have', async () => {
    set({ badges: [badge('primer-aporte', { goalName: null, targetCents: null })] })
    const user = page()
    await user.click(screen.getByRole('button', { name: /Primer aporte, conseguida/ }))
    const dialog = screen.getByRole('dialog', { name: 'Primer aporte' })
    expect(dialog).not.toHaveTextContent('Objetivo alcanzado')
    expect(dialog).toHaveTextContent('Conseguida')
  })

  it('shows a loading state and an error with retry', async () => {
    state.rewards = { isLoading: true, isError: false, data: undefined }
    const { unmount } = render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status', { name: 'Cargando logros' })).toBeInTheDocument()
    unmount()
    state.rewards = { isLoading: false, isError: true, data: undefined }
    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(state.refetch).toHaveBeenCalled()
  })

  it('the day is the one lived in Argentina, not UTC', () => {
    expect(earnedOn('2027-01-16T01:30:00Z')).toBe('15 de enero de 2027')
  })
})

describe('the entry from the profile', () => {
  it('links to the collection with the count', () => {
    set({ badges: [badge('primera-meta'), badge('primer-aporte')] })
    render(
      <MemoryRouter>
        <AchievementsRow />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /Mis logros/ })
    expect(link).toHaveAttribute('href', '/logros')
    expect(link).toHaveTextContent('2 de 10 insignias')
  })
})

describe('the celebration', () => {
  function celebrate() {
    render(
      <MemoryRouter initialEntries={['/metas']}>
        <Routes>
          <Route path="/metas" element={<RewardCelebration />} />
          <Route path="/logros" element={<p>pantalla de logros</p>} />
        </Routes>
      </MemoryRouter>,
    )
    return userEvent.setup()
  }

  it('shows nothing when everything was already seen', () => {
    set({ badges: [badge('primera-meta')], achievements: [achievement()] })
    celebrate()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('celebrates a goal that was really reached, then the badge it unlocked', async () => {
    set({
      achievements: [achievement({ seen: false })],
      badges: [badge('primera-meta', { seen: false })],
    })
    const user = celebrate()
    expect(screen.getByRole('dialog', { name: '¡Meta cumplida!' })).toHaveTextContent(
      'Llegaste al 100% de tu meta Computadora',
    )
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    const dialog = screen.getByRole('dialog', { name: '¡Nueva insignia!' })
    expect(dialog).toHaveTextContent('Primera meta cumplida')
    expect(dialog).toHaveTextContent('Meta: Computadora')
  })

  it('can be closed at any moment and then it is marked as seen (it will not come back)', async () => {
    set({ achievements: [achievement({ seen: false })] })
    const user = celebrate()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.markSeen).toHaveBeenCalledTimes(1)
  })

  it('closing with Escape also marks it as seen', async () => {
    set({ badges: [badge('primer-aporte', { seen: false })] })
    const user = celebrate()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.markSeen).toHaveBeenCalled()
  })

  it('the last slide offers to open the collection', async () => {
    set({ badges: [badge('primer-aporte', { seen: false })] })
    const user = celebrate()
    await user.click(screen.getByRole('button', { name: 'Ver mis logros' }))
    expect(await screen.findByText('pantalla de logros')).toBeInTheDocument()
    expect(state.markSeen).toHaveBeenCalledTimes(1)
  })

  it('it is only about what is real: nothing appears while the rewards are loading or unavailable', () => {
    state.rewards = { isLoading: true, isError: false, data: undefined }
    celebrate()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the badge picture is shown (or a provisional medal), never a broken image', () => {
    set({ badges: [badge('primera-meta', { seen: false })] })
    celebrate()
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).queryByRole('img', { hidden: true }) ??
        dialog.querySelector('img,span[aria-hidden]'),
    ).toBeTruthy()
  })
})
