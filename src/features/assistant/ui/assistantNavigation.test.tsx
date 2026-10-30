import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBrowserRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router'
import { MonthReportPage } from '@/features/dashboard/ui/MonthReportPage'
import { YearReportPage } from '@/features/dashboard/ui/YearReportPage'
import { AssistantPage } from './AssistantPage'

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ isLoading: false, isPlus: true, isFree: false, expiresAt: null }),
  useRedeemPromoCode: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
}))
vi.mock('../api/useAssistantChat', () => ({
  useAssistantChat: () => ({
    messages: [],
    isPending: false,
    plusRequired: false,
    send: vi.fn(),
  }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
vi.mock('@/features/dashboard/api/useMonthSummary', () => {
  const summary = {
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
    availableBalanceCents: 0,
    byCategory: [],
    daily: [],
    recent: [],
  }
  return {
    useMonthSummary: () => ({ data: summary, isLoading: false }),
    useMonthSummaries: (months: string[]) =>
      months.map(() => ({ data: summary, isLoading: false })),
  }
})

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

/** The real screens in a browser router: its history is the browser's, as it is in the app. */
function mount(url: string) {
  window.history.replaceState(null, '', url)
  const router = createBrowserRouter([
    {
      element: (
        <>
          <Where />
          <Outlet />
        </>
      ),
      children: [
        { path: '/', element: <Link to="/este-mes">Ver informe</Link> },
        { path: '/mas', element: <Link to="/tu-anio">Tu año</Link> },
        { path: '/este-mes', element: <MonthReportPage /> },
        { path: '/tu-anio', element: <YearReportPage /> },
        { path: '/informes/asistente', element: <AssistantPage /> },
      ],
    },
  ])
  const view = render(<RouterProvider router={router} />)
  return { router, view }
}

const where = () => screen.getByTestId('where').textContent
const goto = (router: ReturnType<typeof mount>['router'], to: string) =>
  act(() => router.navigate(to))
const browserBack = async () => {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  )
  act(() => window.history.back())
  await popped
}
const mokiBack = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Volver' }))
const openAssistant = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('link', { name: /Asistente/ }))

describe('Navigation around the assistant', () => {
  it('from the monthly summary: assistant → back → the summary → back → Inicio', async () => {
    const { router } = mount('/')
    const user = userEvent.setup()
    await goto(router, '/este-mes')
    await openAssistant(user)
    expect(where()).toBe('/informes/asistente')
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/este-mes'))
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('from Tu año (tools): assistant → back → Tu año → back → where Tu año was opened from', async () => {
    const { router } = mount('/')
    const user = userEvent.setup()
    await goto(router, '/mas')
    await goto(router, '/tu-anio')
    await openAssistant(user)
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/tu-anio'))
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/mas'))
  })

  it('opening the assistant again and again never builds a loop', async () => {
    const { router } = mount('/')
    const user = userEvent.setup()
    await goto(router, '/este-mes')
    for (let i = 0; i < 3; i++) {
      await openAssistant(user)
      await mokiBack(user)
      await waitFor(() => expect(where()).toBe('/este-mes'))
    }
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/'))
  })

  it("the browser's back button does the same as Moni's", async () => {
    const { router } = mount('/')
    const user = userEvent.setup()
    await goto(router, '/este-mes')
    await openAssistant(user)
    await browserBack()
    await waitFor(() => expect(where()).toBe('/este-mes'))
    await browserBack()
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('switching between Este mes and Tu año does not pile up screens', async () => {
    const { router } = mount('/')
    const user = userEvent.setup()
    await goto(router, '/este-mes')
    await user.click(screen.getByRole('link', { name: 'Tu año' }))
    await waitFor(() => expect(where()).toBe('/tu-anio'))
    await user.click(screen.getByRole('link', { name: 'Este mes' }))
    await waitFor(() => expect(where()).toBe('/este-mes'))
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('after reloading the assistant, back still returns to the screen it came from', async () => {
    const first = mount('/')
    const user = userEvent.setup()
    await goto(first.router, '/este-mes')
    await openAssistant(user)
    // A reload keeps the browser history (and its entry numbers) and builds the router again from the URL.
    first.view.unmount()
    first.router.dispose()
    const reloaded = createBrowserRouter([
      {
        element: (
          <>
            <Where />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <p>inicio</p> },
          { path: '/este-mes', element: <MonthReportPage /> },
          { path: '/informes/asistente', element: <AssistantPage /> },
        ],
      },
    ])
    render(<RouterProvider router={reloaded} />)
    expect(where()).toBe('/informes/asistente')
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/este-mes'))
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('opened directly (new tab, no history) the assistant goes to the summary and then to Inicio', async () => {
    mount('/informes/asistente')
    const user = userEvent.setup()
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/este-mes'))
    await mokiBack(user)
    await waitFor(() => expect(where()).toBe('/'))
  })
})
