import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import { DEFAULT_NOTICE_PREFS, type NoticePrefs } from '@/features/debts/domain/debts'
import { GroupNoticePrefs } from './GroupNoticePrefs'

const state = vi.hoisted(() => ({ data: null as unknown, mutate: vi.fn(), extra: { expenseAddedPush: true, paymentsDue: true, priceChanges: true, budgets: true } as unknown, extraSave: vi.fn(), isPlus: false }))
vi.mock('@/features/notifications/ui/useNotificationCenter', () => ({
  useCenterPrefs: () => ({ prefs: state.extra, isAvailable: true, save: { mutate: state.extraSave } }),
}))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => ({ isPlus: state.isPlus }) }))
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
  beforeEach(() => {
    state.mutate.mockClear()
    state.extraSave.mockClear()
    state.isPlus = false
  })

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

  it('saves the extra push choice and shows the Plus center choices only with Plus', async () => {
    state.data = DEFAULT_NOTICE_PREFS
    renderIt()
    expect(screen.queryByRole('switch', { name: 'Pagos próximos' })).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Gastos en los que te incluyen' }))
    expect(state.extraSave).toHaveBeenLastCalledWith(
      { expenseAddedPush: false, paymentsDue: true, priceChanges: true, budgets: true },
      expect.anything(),
    )
  })

  it('with Plus, the center choices are saved in Supabase too', async () => {
    state.data = DEFAULT_NOTICE_PREFS
    state.isPlus = true
    renderIt()
    await userEvent.click(screen.getByRole('switch', { name: 'Aumentos de precio' }))
    expect(state.extraSave).toHaveBeenLastCalledWith(
      { expenseAddedPush: true, paymentsDue: true, priceChanges: false, budgets: true },
      expect.anything(),
    )
  })
})
