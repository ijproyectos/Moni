import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { PersonalDataPage } from './PersonalDataPage'
import { ProfilePage } from './ProfilePage'
import { SettingsPage } from './SettingsPage'

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
  useNoticePrefs: () => ({ data: null }),
  useSetNoticePrefs: () => ({ mutate: vi.fn() }),
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

function setup(Page: () => React.ReactElement = ProfilePage) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HiddenAmountsProvider>
          <Page />
        </HiddenAmountsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Perfil', () => {
  it('shows the person, Salud financiera, Mis datos and App, and the gear to Configuración', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('GRATIS')).toBeInTheDocument()
    const health = screen.getByRole('link', { name: /Salud financiera/ })
    expect(health).toHaveAttribute('href', '/salud')
    expect(health).toHaveTextContent('68 de 100 · Bien encaminado')
    expect(screen.getByRole('link', { name: /^Datos personales/ })).toHaveAttribute('href', '/perfil/datos')
    expect(screen.getByRole('button', { name: /^Mis objetivos/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Configuración/ })).toHaveAttribute('href', '/perfil/configuracion')
    expect(screen.getAllByRole('link', { name: /^Configuración/ })).toHaveLength(1)
  })

  it('no longer carries the shortcut cards nor the settings', () => {
    setup()
    for (const name of [/^Presupuesto/, /^Gastos fijos/, /^Grupos/, /Cerrar sesión/, /Eliminar cuenta/]) {
      expect(screen.queryByRole('link', { name })).toBeNull()
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByRole('radiogroup', { name: 'Tema de color' })).toBeNull()
  })
})

describe('Configuración', () => {
  it('has Apariencia (sun and moon (only two) and privacy), Cuenta, Ayuda and sign out at the end', () => {
    setup(SettingsPage)
    const theme = screen.getByRole('radiogroup', { name: 'Tema de color' })
    expect(within(theme).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Claro', 'Oscuro'])
    expect(screen.getByRole('switch', { name: 'Modo privacidad' })).toHaveAttribute('aria-checked', 'false')
    const payments = screen.getByRole('link', { name: /Tarjetas y medios de pago/ })
    expect(payments).toHaveAttribute('href', '/cuentas')
    expect(within(payments).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pasar a Moni Plus/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ayuda y contacto/ })).toHaveAttribute('href', '/soporte')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar cuenta' })).toBeInTheDocument()
  })
})

describe('Datos personales', () => {
  it('shows the name (editable), the mail and the currency, and saves with "Guardar cambios"', () => {
    setup(PersonalDataPage)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez')
    expect(screen.getByLabelText('Mail')).toHaveValue('ana@example.com')
    expect(screen.getByText('Peso argentino · $')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })
})
