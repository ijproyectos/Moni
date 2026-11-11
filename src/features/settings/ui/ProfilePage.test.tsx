import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { ProfilePage } from './ProfilePage'

vi.mock('@/features/auth/api/authContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ana@example.com' } }),
}))
vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({
    data: { display_name: 'Ana Pérez', avatar_url: null, goals: [] },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
}))
vi.mock('@/features/dashboard/api/useDailyAllowance', () => ({
  useDailyAllowance: () => ({
    isLoading: false,
    allowance: { kind: 'sin-datos' },
    status: null,
    pace: null,
  }),
}))
vi.mock('@/features/health/api/useFinancialHealth', () => ({
  useFinancialHealth: () => ({
    isLoading: false,
    current: null,
    score: { kind: 'ok', score: 68, band: 'bien', factors: [] },
    series: [],
    delta: null,
    suggestion: null,
  }),
}))
vi.mock('@/features/debts/api/useDebts', () => ({
  usePendingDebts: () => ({ debts: [{ direction: 'owed', amountCents: 577_00 }] }),
}))
vi.mock('@/features/fixedExpenses/api/useFixedExpenses', () => ({
  useFixedExpenses: () => ({ data: undefined }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({
  useSavings: () => ({ data: { goals: [{ status: 'active' }, { status: 'paused' }] } }),
}))
vi.mock('@/features/goals/ui/AchievementsRow', () => ({ AchievementsRow: () => null }))
vi.mock('@/features/push/ui/PushNotificationsRow', () => ({ PushNotificationsRow: () => null }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ isPlus: false, isFree: true, expiresAt: null }),
}))
vi.mock('@/features/plus/api/useBilling', () => ({
  useSubscriptionState: () => ({ data: undefined }),
}))

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HiddenAmountsProvider>
          <ProfilePage />
        </HiddenAmountsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfilePage', () => {
  it('follows the design: person and plan, Salud financiera, four accesses, settings', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('GRATIS')).toBeInTheDocument()
    const health = screen.getByRole('link', { name: /Salud financiera/ })
    expect(health).toHaveAttribute('href', '/salud')
    expect(health).toHaveTextContent('68 de 100 · Bien encaminado')
    for (const name of [/^Presupuesto/, /^Gastos fijos/, /^Metas de ahorro/, /^Grupos/]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /^Grupos/ })).toHaveTextContent('te deben $577')
    expect(screen.getByRole('link', { name: /^Metas de ahorro/ })).toHaveTextContent(
      '1 meta activa',
    )
    expect(screen.getByRole('radiogroup', { name: 'Tema de color' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Modo privacidad' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    const payments = screen.getByRole('link', { name: /Tarjetas y medios de pago/ })
    expect(payments).toHaveAttribute('href', '/cuentas')
    expect(within(payments).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pasar a Moni Plus/ })).toBeInTheDocument()
  })

  it('keeps sign out, delete account and "Más herramientas" at the end', () => {
    setup()
    expect(screen.getByText('Más herramientas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gastos hormiga/ })).toHaveAttribute(
      'href',
      '/hormigas',
    )
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eliminar cuenta/ })).toBeInTheDocument()
  })
})
