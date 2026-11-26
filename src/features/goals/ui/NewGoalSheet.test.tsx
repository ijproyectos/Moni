import { render, screen } from '@testing-library/react'
import { NewGoalSheet } from './NewGoalSheet'

const state = vi.hoisted(() => ({ plan: { isPlus: false, isFree: true, isLoading: false }, goals: [] as { status: string }[] }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => state.plan }))
vi.mock('@/features/plus/ui/PlusSheet', () => ({ PlusSheet: () => null }))
vi.mock('../api/useSavings', () => ({ useSavings: () => ({ data: { goals: state.goals } }) }))
vi.mock('./SavingsGoalFormSheet', () => ({ SavingsGoalFormSheet: () => <div role="dialog" aria-label="Formulario de meta" /> }))

describe('NewGoalSheet (free plan: one goal in total)', () => {
  beforeEach(() => {
    state.plan = { isPlus: false, isFree: true, isLoading: false }
  })

  it('Free with no goal can create the first one', () => {
    state.goals = []
    render(<NewGoalSheet onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Formulario de meta' })).toBeInTheDocument()
  })

  it('Free with one goal gets the Moni Plus promo instead of the form', () => {
    state.goals = [{ status: 'active' }]
    render(<NewGoalSheet onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Soñemos en grande' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Formulario de meta' })).toBeNull()
  })

  it('the limit is ONE goal in total: completed, paused or archived ones still count, so closing a goal never frees it', () => {
    for (const status of ['completed', 'archived', 'paused']) {
      state.goals = [{ status }]
      const { unmount } = render(<NewGoalSheet onClose={() => undefined} />)
      expect(screen.getByRole('dialog', { name: 'Soñemos en grande' })).toBeInTheDocument()
      unmount()
    }
  })

  it('Moni Plus has no limit', () => {
    state.plan = { isPlus: true, isFree: false, isLoading: false }
    state.goals = [{ status: 'active' }, { status: 'active' }, { status: 'active' }]
    render(<NewGoalSheet onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Formulario de meta' })).toBeInTheDocument()
  })
})
