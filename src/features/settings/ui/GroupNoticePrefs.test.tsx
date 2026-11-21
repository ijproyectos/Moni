import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import { DEFAULT_NOTICE_PREFS, type NoticePrefs } from '@/features/debts/domain/debts'
import { GroupNoticePrefs } from './GroupNoticePrefs'

const state = vi.hoisted(() => ({ data: null as unknown, mutate: vi.fn() }))
vi.mock('@/features/debts/api/useDebts', () => ({
  useNoticePrefs: () => ({ data: state.data }),
  useSetNoticePrefs: () => ({ mutate: state.mutate }),
}))

const renderIt = () =>
  render(
    <ToastProvider>
      <GroupNoticePrefs />
    </ToastProvider>,
  )

describe('Avisos de grupos (Configuración)', () => {
  beforeEach(() => state.mutate.mockClear())

  it('is not shown while the database has no preferences yet', () => {
    state.data = null
    renderIt()
    expect(screen.queryByText('Avisos de grupos')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows the four choices, with details shown by default', () => {
    state.data = DEFAULT_NOTICE_PREFS
    renderIt()
    expect(screen.getByRole('switch', { name: 'Recordatorios de pago' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Pagos registrados' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Pagos confirmados o rechazados' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Ocultar detalles en la notificación' })).not.toBeChecked()
    expect(screen.getByText(/siempre quedan en Moni/)).toBeInTheDocument()
  })

  it('each switch saves the whole set of preferences (to Supabase) with only that one changed', async () => {
    state.data = { debtReminders: true, paymentsReported: true, paymentsAnswered: false, hideDetails: false } satisfies NoticePrefs
    renderIt()
    await userEvent.click(screen.getByRole('switch', { name: 'Ocultar detalles en la notificación' }))
    expect(state.mutate).toHaveBeenLastCalledWith(
      { debtReminders: true, paymentsReported: true, paymentsAnswered: false, hideDetails: true },
      expect.anything(),
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Recordatorios de pago' }))
    expect(state.mutate).toHaveBeenLastCalledWith(
      { debtReminders: false, paymentsReported: true, paymentsAnswered: false, hideDetails: false },
      expect.anything(),
    )
  })
})
