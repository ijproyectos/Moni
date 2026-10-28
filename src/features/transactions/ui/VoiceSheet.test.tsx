import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { VoiceSheet } from './VoiceSheet'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '22222222-2222-4222-8222-222222222222'
const TRANSPORT_ID = '33333333-3333-4333-8333-333333333333'
const SALARY_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), createTransaction: vi.fn() }))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: null,
  getSupabase: () => ({ functions: { invoke: mocks.invoke } }),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/transactionsRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/transactionsRepository')>()),
  createTransaction: mocks.createTransaction,
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: accounts, isLoading: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: categories, isLoading: false }),
}))

const accounts: Account[] = [
  {
    id: ACCOUNT_ID,
    name: 'Efectivo',
    kind: 'cash',
    currency: 'ARS',
    openingBalanceCents: 0,
    balanceCents: 0,
    archivedAt: null,
  },
]
const cat = (id: string, name: string, kind: 'expense' | 'income'): Category => ({
  id,
  kind,
  name,
  icon: 'Utensils',
  color: '#E5533D',
  archivedAt: null,
})
const categories: Category[] = [
  cat(FOOD_ID, 'Comida', 'expense'),
  cat(TRANSPORT_ID, 'Transporte', 'expense'),
  cat(SALARY_ID, 'Sueldo', 'income'),
]

const RESPONSE = {
  movements: [
    {
      kind: 'expense',
      amountCents: 500_000,
      note: 'Colectivo',
      categoryId: TRANSPORT_ID,
      accountId: ACCOUNT_ID,
      occurredOn: '2026-10-27',
      confidence: 0.95,
    },
    {
      kind: 'expense',
      amountCents: 1_800_000,
      note: 'Almuerzo',
      categoryId: null,
      accountId: ACCOUNT_ID,
      occurredOn: '2026-10-28',
      confidence: 0.4,
    },
  ],
  warnings: [],
}

class FakeRecognition {
  static instances: FakeRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() {
    FakeRecognition.instances.push(this)
  }
  say(transcript: string) {
    this.onresult?.({ length: 1, results: { length: 1, 0: { isFinal: true, 0: { transcript } } } })
  }
}

type SpeechWindow = { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown }

function renderSheet(props: { startWith?: 'promo' | 'text' } = {}) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <VoiceSheet onClose={onClose} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

async function reachConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Probar ahora' }))
  act(() => FakeRecognition.instances[0]?.say('gasté 5 lucas en el bondi y 18 en el almuerzo'))
  await user.click(screen.getByRole('button', { name: 'Listo' }))
  await screen.findByText('Revisá y guardá')
}

beforeEach(() => {
  FakeRecognition.instances = []
  mocks.invoke.mockReset()
  mocks.createTransaction.mockReset()
  mocks.createTransaction.mockResolvedValue(undefined)
  mocks.invoke.mockResolvedValue({ data: RESPONSE, error: null })
  ;(window as unknown as SpeechWindow).webkitSpeechRecognition = FakeRecognition
})

afterEach(() => {
  delete (window as unknown as SpeechWindow).webkitSpeechRecognition
  delete (window as unknown as SpeechWindow).SpeechRecognition
})

describe('VoiceSheet', () => {
  it('falls back to a text box when speech recognition is unsupported', async () => {
    delete (window as unknown as SpeechWindow).webkitSpeechRecognition
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Probar ahora' }))
    expect(screen.getByRole('textbox', { name: 'Escribilo como te salga' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hablar' })).not.toBeInTheDocument()
  })

  it('opens straight into the text box with startWith="text" and parses typed text', async () => {
    const { user } = renderSheet({ startWith: 'text' })
    await user.type(screen.getByRole('textbox'), 'ayer 5 lucas de bondi')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await screen.findByText('Revisá y guardá')
    expect(mocks.invoke).toHaveBeenCalledWith('parse-movements', {
      body: { text: 'ayer 5 lucas de bondi', today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
  })

  it('listens, shows the live transcript, parses it and renders the confirmation list', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Probar ahora' }))

    const recognition = FakeRecognition.instances[0]
    expect(recognition?.start).toHaveBeenCalled()
    expect(recognition?.lang).toBe('es-AR')
    expect(screen.getByRole('button', { name: 'Dejar de escuchar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(/Escuchando/)).toBeInTheDocument()

    act(() => recognition?.say('gasté 5 lucas en el bondi'))
    expect(screen.getByRole('textbox')).toHaveValue('gasté 5 lucas en el bondi')

    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByRole('listitem', { name: 'Movimiento 1' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Movimiento 2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monto del movimiento 1')).toHaveValue('5.000')
    expect(screen.getByLabelText('Nota del movimiento 2')).toHaveValue('Almuerzo')
    // Low confidence / no category is highlighted.
    expect(screen.getByText('Elegí una categoría para este movimiento.')).toBeInTheDocument()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('applies edits to the saved payload, sends integer cents and creates N transactions', async () => {
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)

    const amount = screen.getByLabelText('Monto del movimiento 1')
    await user.clear(amount)
    await user.type(amount, '6.250,50')
    const second = within(screen.getByRole('group', { name: 'Categoría del movimiento 2' }))
    await user.click(second.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar 2 movimientos' }))

    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(2))
    expect(mocks.createTransaction.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      amount: 625_050,
      categoryId: TRANSPORT_ID,
      accountId: ACCOUNT_ID,
      note: 'Colectivo',
      occurredOn: '2026-10-27',
    })
    expect(mocks.createTransaction.mock.calls[1]?.[0]).toMatchObject({
      amount: 1_800_000,
      categoryId: FOOD_ID,
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('blocks saving while a draft has no category and removes drafts on request', async () => {
    const { user } = renderSheet()
    await reachConfirmation(user)

    await user.click(screen.getByRole('button', { name: 'Guardar 2 movimientos' }))
    expect(await screen.findByText('Elegí una categoría.')).toBeInTheDocument()
    expect(mocks.createTransaction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Quitar movimiento 2' }))
    expect(screen.getByRole('button', { name: 'Guardar 1 movimiento' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar 1 movimiento' }))
    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1))
  })

  it('switching the kind clears an incompatible category', async () => {
    const { user } = renderSheet()
    await reachConfirmation(user)
    const group = within(screen.getByRole('group', { name: 'Tipo del movimiento 1' }))
    await user.click(group.getByRole('button', { name: 'Ingreso' }))
    const categoriesGroup = within(
      screen.getByRole('group', { name: 'Categoría del movimiento 1' }),
    )
    expect(categoriesGroup.queryByRole('button', { name: 'Transporte' })).not.toBeInTheDocument()
    expect(categoriesGroup.getByRole('button', { name: 'Sueldo' })).toBeInTheDocument()
    expect(screen.getAllByText('Elegí una categoría para este movimiento.')).toHaveLength(2)
  })

  it('keeps only the failed items and reports their error when a save fails', async () => {
    mocks.createTransaction.mockResolvedValueOnce(undefined).mockRejectedValueOnce({
      code: '42501',
      message: 'permission denied',
    })
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)
    const second = within(screen.getByRole('group', { name: 'Categoría del movimiento 2' }))
    await user.click(second.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar 2 movimientos' }))

    expect(await screen.findByText('No tenés permiso para hacer eso.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar 1 movimiento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nota del movimiento 1')).toHaveValue('Almuerzo')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the friendly message when the daily quota is exceeded', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'ai_quota_exceeded' }), { status: 429 }),
      ),
    })
    const { user } = renderSheet({ startWith: 'text' })
    await user.type(screen.getByRole('textbox'), '5 lucas bondi')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(
      await screen.findByText(
        'Llegaste al límite de cargas con Moni por hoy. Probá mañana o cargalo a mano.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Revisá y guardá')).not.toBeInTheDocument()
  })

  it('says so when nothing was understood', async () => {
    mocks.invoke.mockResolvedValue({ data: { movements: [], warnings: [] }, error: null })
    const { user } = renderSheet({ startWith: 'text' })
    await user.type(screen.getByRole('textbox'), 'hola qué tal')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByText(/No encontré gastos ni ingresos/)).toBeInTheDocument()
  })

  it('saves nothing when the person cancels', async () => {
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('cancelling while dictating stops the microphone and saves nothing', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Probar ahora' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(FakeRecognition.instances[0]?.stop).toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('tells the person when the microphone is denied and keeps the text box', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Probar ahora' }))
    act(() => FakeRecognition.instances[0]?.onerror?.({ error: 'not-allowed' }))
    expect(await screen.findByText(/No pudimos usar el micrófono/)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})
