import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeGoal, makeSavings, makeSavingsAccount } from '../domain/testing'
import { GoalDetailPage } from './GoalDetailPage'

const state = vi.hoisted(() => ({ data: null as unknown, loading: false }))
vi.mock('../api/useSavings', () => ({
  useSavings: () => ({ data: state.data, isLoading: state.loading }),
  useSetGoalStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidMovement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWithdrawReserve: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddDeposit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSnoozeReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function renderAt(id: string) {
  render(
    <MemoryRouter initialEntries={[`/metas/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/metas/:id" element={<GoalDetailPage />} />
          <Route path="/metas" element={<p>lista de metas</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('GoalDetailPage', () => {
  it('opens a real goal by its id', () => {
    state.loading = false
    state.data = makeSavings({
      accounts: [makeSavingsAccount()],
      goals: [makeGoal({ id: 'real-1', name: 'Viaje a Brasil' })],
    })
    renderAt('real-1')
    expect(screen.getByRole('heading', { name: 'Viaje a Brasil' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar dinero' })).toBeInTheDocument()
  })

  it('waits while the goals load instead of bouncing the person to the list', () => {
    state.data = undefined
    state.loading = true
    renderAt('real-1')
    expect(screen.queryByText('lista de metas')).toBeNull()
  })

  it('an unknown goal goes back to the list', () => {
    state.loading = false
    state.data = makeSavings({ accounts: [makeSavingsAccount()], goals: [] })
    renderAt('nope')
    expect(screen.getByText('lista de metas')).toBeInTheDocument()
  })
})
