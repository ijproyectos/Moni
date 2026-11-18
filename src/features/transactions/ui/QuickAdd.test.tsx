import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { MovementSheetContext } from './movementSheetContext'
import { QuickAdd } from './QuickAdd'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  downscale: vi.fn(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: null,
  getSupabase: () => ({ functions: { invoke: mocks.invoke } }),
}))
const plusState = vi.hoisted(() => ({ isFree: false }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({
    isLoading: false,
    isPlus: !plusState.isFree,
    isFree: plusState.isFree,
    expiresAt: null,
  }),
  useRedeemPromoCode: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/transactionsRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/transactionsRepository')>()),
  createTransaction: mocks.createTransaction,
  listTransactions: mocks.listTransactions,
}))
vi.mock('@/features/dashboard/api/useDailyAllowance', () => ({
  useDailyAllowance: () => ({ isLoading: false, allowance: { kind: 'sin-datos' }, status: null, pace: null }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: accounts, isLoading: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: categories, isLoading: false }),
}))
vi.mock('@/features/ai/domain/imageDownscale', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/domain/imageDownscale')>()),
  downscaleImage: mocks.downscale,
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
    creditLimitCents: null,
    closingDay: null,
    dueDay: null,
    transferAlias: null,
    transferCbu: null,
  },
]
const categories: Category[] = [
  {
    id: FOOD_ID,
    kind: 'expense',
    name: 'Comida',
    icon: 'Utensils',
    color: '#E5533D',
    archivedAt: null,
  },
]

const RECEIPT_RESPONSE = {
  movements: [
    {
      kind: 'expense',
      amountCents: 1_234_550,
      note: 'Carrefour Express',
      categoryId: FOOD_ID,
      accountId: null,
      occurredOn: '2026-10-27',
      confidence: 0.9,
    },
  ],
  warnings: [],
}

function renderQuickAdd() {
  const openNew = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MovementSheetContext.Provider value={{ openNew, openEdit: vi.fn() }}>
        <QuickAdd />
      </MovementSheetContext.Provider>
    </QueryClientProvider>,
  )
  return { openNew, user: userEvent.setup() }
}

function pickPhoto() {
  const file = new File([new Uint8Array(10)], 'ticket.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByTestId('receipt-input'), { target: { files: [file] } })
}

beforeEach(() => {
  plusState.isFree = false
  mocks.invoke.mockReset()
  mocks.createTransaction.mockReset()
  mocks.createTransaction.mockResolvedValue(undefined)
  mocks.listTransactions.mockReset()
  mocks.listTransactions.mockResolvedValue([])
  mocks.downscale.mockReset()
  mocks.downscale.mockResolvedValue({
    base64: 'QUJD',
    mediaType: 'image/jpeg',
    width: 1,
    height: 1,
    bytes: 3,
  })
  mocks.invoke.mockResolvedValue({ data: RECEIPT_RESPONSE, error: null })
})

afterEach(() => {
  act(() => onlineManager.setOnline(true))
  vi.restoreAllMocks()
})

describe('QuickAdd (Hablá con Moni, Foto, Manual)', () => {
  it('shows the cat to talk to Moni and the Foto and Manual buttons', () => {
    renderQuickAdd()
    const section = screen.getByRole('region', { name: 'Hablá con Moni' })
    expect(within(section).getByRole('button', { name: 'Hablá con Moni' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(section).getByRole('button', { name: 'Foto' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Manual' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Manual" opens the usual new-movement form', async () => {
    const { user, openNew } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Manual' }))
    expect(openNew).toHaveBeenCalledTimes(1)
    expect(openNew).toHaveBeenCalledWith()
  })

  it('"Foto" opens the camera / file picker in the same tap (the input is always mounted)', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderQuickAdd()
    const input = screen.getByTestId('receipt-input')
    await user.click(screen.getByRole('button', { name: 'Foto' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('receipt-input')).toBe(input)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
  })

  it('the cat opens the one chat; a written expense is read and offered for review (nothing is saved yet)', async () => {
    mocks.invoke.mockImplementation(async (name: string) =>
      name === 'parse-movements'
        ? {
            data: {
              movements: [
                { kind: 'expense', amountCents: 18_000_00, note: 'Chino', categoryId: FOOD_ID, accountId: null, occurredOn: '2026-10-27', confidence: 0.9 },
              ],
              warnings: [],
            },
            error: null,
          }
        : { data: { reply: 'ok' }, error: null },
    )
    const { user } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Hablá con Moni' }))
    expect(screen.getByRole('dialog', { name: 'Hablá con Moni' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Tu pregunta'), 'Gasté $18.000 en el chino')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Entendí:/)).toBeInTheDocument()
    expect(mocks.invoke).toHaveBeenCalledWith('parse-movements', expect.anything())
    expect(mocks.createTransaction).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Revisar y guardar' }))
    expect(await screen.findByText('Revisá y guardá')).toBeInTheDocument()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('a question goes to the assistant in the same chat and a follow-up keeps the history', async () => {
    mocks.invoke.mockResolvedValue({ data: { reply: 'Tenés $5.000' }, error: null })
    const { user } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Hablá con Moni' }))
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Cuánto tengo?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Tenés $5.000')).toBeInTheDocument()
    expect(mocks.invoke).toHaveBeenCalledWith('insights-chat', expect.anything())
    expect(mocks.invoke).not.toHaveBeenCalledWith('parse-movements', expect.anything())
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Y en el banco?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
    const body = (mocks.invoke.mock.calls[1]?.[1] as { body: { messages: unknown[] } }).body
    expect(body.messages).toHaveLength(3)
  })
})

describe('QuickAdd free plan gate', () => {
  it('the chat is Plus: a free user sees the upsell and nothing is sent', async () => {
    plusState.isFree = true
    const { user } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Hablá con Moni' }))
    expect(screen.getByText('El asistente es de Moni Plus')).toBeInTheDocument()
    expect(mocks.invoke).not.toHaveBeenCalledWith('parse-movements', expect.anything())
  })

  it('does not open the file picker for a free user and keeps Manual free', async () => {
    plusState.isFree = true
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { user, openNew } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Foto' }))
    expect(click).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: /Escanear tickets es de Moni Plus/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(screen.getByRole('button', { name: 'Manual' }))
    expect(openNew).toHaveBeenCalled()
  })

  it('shows the upsell when the server answers 402 plus_required to a scan', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'plus_required' }), { status: 402 }),
      ),
    })
    const { user } = renderQuickAdd()
    await user.click(screen.getByRole('button', { name: 'Foto' }))
    pickPhoto()
    expect(
      await screen.findByRole('dialog', { name: /Escanear tickets es de Moni Plus/ }),
    ).toBeInTheDocument()
  })
})

describe('QuickAdd receipt scan', () => {
  it('shows the chosen photo with the scan sweep and "Analizando…" while the receipt is read', async () => {
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:picked-ticket')
    URL.revokeObjectURL = vi.fn()
    try {
      renderQuickAdd()
      pickPhoto()
      // Same as the "Analizando tu factura…" test: the mocked call resolves right after, so assert synchronously.
      expect(screen.getByRole('img', { name: 'Foto de tu factura' })).toHaveAttribute(
        'src',
        'blob:picked-ticket',
      )
      expect(screen.getByTestId('receipt-scan-sweep')).toBeInTheDocument()
      expect(screen.getByText('Analizando…')).toBeInTheDocument()
      expect(await screen.findByText('Revisá y guardá')).toBeInTheDocument()
    } finally {
      cleanup()
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('analyzes the photo and shows the confirmation list prefilled, saving nothing by itself', async () => {
    renderQuickAdd()
    pickPhoto()
    expect(screen.getByText('Analizando tu factura…')).toBeInTheDocument()

    expect(await screen.findByText('Revisá y guardá')).toBeInTheDocument()
    expect(mocks.invoke).toHaveBeenCalledWith('parse-receipt', {
      body: {
        image: 'QUJD',
        mediaType: 'image/jpeg',
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      signal: expect.any(AbortSignal),
    })
    expect(
      screen.getByRole('button', { name: 'Monto del movimiento 1: $12.345,50' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nota del movimiento 1: Carrefour Express' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha del movimiento 1')).toHaveValue('2026-10-27')
    // A single account is not a guess: it is the only one there is.
    expect(screen.getByLabelText('Cuenta del movimiento 1')).toHaveDisplayValue('Efectivo')
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('saves the draft only after the explicit Confirmar tap', async () => {
    const { user } = renderQuickAdd()
    pickPhoto()
    await screen.findByText('Revisá y guardá')
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1))
    expect(mocks.createTransaction.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      amount: 1_234_550,
      categoryId: FOOD_ID,
      accountId: ACCOUNT_ID,
      note: 'Carrefour Express',
    })
    await waitFor(() => expect(screen.queryByText('Revisá y guardá')).not.toBeInTheDocument())
  })

  it('cancel aborts the request and closes without saving', async () => {
    let aborted = false
    mocks.invoke.mockImplementation(
      (_name: string, options: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          options.signal.addEventListener('abort', () => {
            aborted = true
            resolve({ data: null, error: new Error('aborted') })
          })
        }),
    )
    const { user } = renderQuickAdd()
    pickPhoto()
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(aborted).toBe(true))
    expect(screen.queryByText('Analizando tu factura…')).not.toBeInTheDocument()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('shows the unsupported-currency message and offers another photo', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'unsupported_currency' }), { status: 422 }),
      ),
    })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderQuickAdd()
    pickPhoto()
    expect(await screen.findByText(/solo lee facturas en pesos argentinos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Probar con otra foto' }))
    expect(click).toHaveBeenCalled()
  })

  it('shows the quota message when the daily limit is reached', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'ai_quota_exceeded' }), { status: 429 }),
      ),
    })
    renderQuickAdd()
    pickPhoto()
    expect(
      await screen.findByText(/Llegaste al límite de cargas con Moni por hoy/),
    ).toBeInTheDocument()
  })

  it('reports an unreadable photo without calling the function', async () => {
    const { DownscaleError } = await import('@/features/ai/domain/imageDownscale')
    mocks.downscale.mockRejectedValue(new DownscaleError('decode_failed'))
    renderQuickAdd()
    pickPhoto()
    expect(
      await screen.findByText('No pudimos abrir esa foto. Probá con otra.'),
    ).toBeInTheDocument()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
