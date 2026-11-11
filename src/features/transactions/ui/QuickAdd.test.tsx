import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { makeTransaction } from '../domain/testing'
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

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Nuevo movimiento' }))
  return screen.getByRole('dialog', { name: '¿Cómo lo cargás?' })
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

describe('QuickAdd sheet (screen 18)', () => {
  it('opens the assistant sheet with Foto, Voz and A mano, in that order, and the group shortcut', async () => {
    const { user } = renderQuickAdd()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const fab = screen.getByRole('button', { name: 'Nuevo movimiento' })
    expect(fab).toHaveAttribute('aria-haspopup', 'dialog')

    const dialog = await openMenu(user)
    expect(within(dialog).getByText('Contame y yo lo ordeno')).toBeInTheDocument()
    const ways = within(dialog)
      .getAllByRole('button')
      .map((el) => el.textContent)
      .filter((t) => /^(Foto|Voz|A mano)/.test(t ?? ''))
    expect(ways).toEqual(['Fotodel ticket', 'Vozhablale a Moni', 'A manocon teclado'])
    expect(
      within(dialog).getByRole('button', { name: 'Dividir un gasto con un grupo' }),
    ).toBeInTheDocument()
    // No recent expenses: the section is not invented.
    expect(screen.queryByText('Repetir uno reciente')).not.toBeInTheDocument()
  })

  it('closes with Escape, the X and the scrim, and gives focus back to the cat', async () => {
    const { user } = renderQuickAdd()
    const fab = screen.getByRole('button', { name: 'Nuevo movimiento' })

    await openMenu(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fab).toHaveFocus()

    await openMenu(user)
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"A mano" opens the usual new-movement form', async () => {
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: /^A mano/ }))
    expect(openNew).toHaveBeenCalledTimes(1)
    expect(openNew).toHaveBeenCalledWith()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Dividir un gasto con un grupo" opens the form already shared', async () => {
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: 'Dividir un gasto con un grupo' }))
    expect(openNew).toHaveBeenCalledWith('expense', { shared: true })
  })

  it('"Voz" opens the voice conversation', async () => {
    const { user } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: /^Voz/ }))
    expect(screen.getByRole('dialog', { name: 'Carga por voz' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '¿Cómo lo cargás?' })).not.toBeInTheDocument()
  })

  it('"Foto" opens the camera / file picker in the same tap (the input is always mounted)', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderQuickAdd()
    const input = screen.getByTestId('receipt-input')
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: /^Foto/ }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('receipt-input')).toBe(input)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
  })

  it('offline: photo and voice are disabled with the offline notice, manual stays available', async () => {
    act(() => onlineManager.setOnline(false))
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    expect(screen.getByRole('button', { name: /^Foto/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Voz/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^A mano/ })).toBeEnabled()
    expect(screen.getByText('Sin conexión. Conectate para guardar cambios.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^A mano/ }))
    expect(openNew).toHaveBeenCalled()
  })

  it('"Repetir uno reciente" lists distinct recent expenses of the person and prefills the form', async () => {
    mocks.listTransactions.mockResolvedValue([
      makeTransaction({ id: 'a', note: 'Café', amountCents: 4_800_00, occurredOn: '2026-10-20' }),
      makeTransaction({ id: 'b', note: 'Café', amountCents: 4_500_00, occurredOn: '2026-10-10' }),
      makeTransaction({ id: 'c', note: 'SUBE', amountCents: 2_000_00, occurredOn: '2026-10-21' }),
    ])
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    // Most frequent first; each suggestion once, with its latest amount.
    const chip = await screen.findByRole('button', { name: 'Café $4.800' })
    expect(screen.getByRole('button', { name: 'SUBE $2.000' })).toBeInTheDocument()
    await user.click(chip)
    expect(openNew).toHaveBeenCalledWith('expense', {
      initial: { amountCents: 4_800_00, categoryId: FOOD_ID, accountId: ACCOUNT_ID, note: 'Café' },
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('QuickAdd free plan gate', () => {
  it('tags photo and voice with Plus and opens the upsell instead of the capability', async () => {
    plusState.isFree = true
    const { user } = renderQuickAdd()
    await openMenu(user)
    expect(screen.getByRole('button', { name: /^Foto.*Plus$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Voz.*Plus$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^A mano/ })).not.toHaveTextContent('Plus')

    await user.click(screen.getByRole('button', { name: /^Voz/ }))
    expect(
      await screen.findByRole('dialog', { name: /Cargar por voz es de Moni Plus/ }),
    ).toBeInTheDocument()
  })

  it('does not open the file picker for a free user and keeps A mano free', async () => {
    plusState.isFree = true
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: /^Foto/ }))
    expect(click).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('dialog', { name: /Escanear tickets es de Moni Plus/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(screen.getByRole('button', { name: 'Nuevo movimiento' }))
    await user.click(screen.getByRole('button', { name: /^A mano/ }))
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
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: /^Foto/ }))
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
