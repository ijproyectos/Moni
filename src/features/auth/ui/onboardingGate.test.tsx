import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RedirectIfOnboarded, RequireOnboarded } from './guards'

const profileState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../api/useProfile', () => ({ useProfile: () => profileState.current }))

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RedirectIfOnboarded />}>
          <Route path="/onboarding" element={<p>onboarding</p>} />
        </Route>
        <Route element={<RequireOnboarded />}>
          <Route path="/" element={<p>private</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('onboarding gate', () => {
  it('redirects private routes to /onboarding when onboarding is not completed', async () => {
    profileState.current = {
      data: { onboarding_completed_at: null },
      isLoading: false,
      isError: false,
    }
    renderAt('/')
    expect(await screen.findByText('onboarding')).toBeInTheDocument()
    expect(screen.queryByText('private')).not.toBeInTheDocument()
  })

  it('lets onboarded people through and keeps them out of the flow', async () => {
    profileState.current = {
      data: { onboarding_completed_at: '2026-10-26T10:00:00Z' },
      isLoading: false,
      isError: false,
    }
    renderAt('/')
    expect(await screen.findByText('private')).toBeInTheDocument()
    renderAt('/onboarding')
    expect(await screen.findAllByText('private')).not.toHaveLength(0)
  })

  it('offers a retry when the profile cannot be loaded', () => {
    profileState.current = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
    renderAt('/')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
