import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  downscale: vi.fn(),
}))

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
  return screen.getByRole('menu', { name: 'Agregar movimiento' })
}

function pickPhoto() {
  const file = new File([new Uint8Array(10)], 'ticket.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByTestId('receipt-input'), { target: { files: [file] } })
}

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.createTransaction.mockReset()
  mocks.createTransaction.mockResolvedValue(undefined)
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

describe('QuickAdd add menu', () => {
  it('opens a menu with exactly Sacar foto, Por voz and Manual, in that order', async () => {
    const { user } = renderQuickAdd()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const fab = screen.getByRole('button', { name: 'Nuevo movimiento' })
    expect(fab).toHaveAttribute('aria-haspopup', 'menu')
    expect(fab).toHaveAttribute('aria-expanded', 'false')

    await openMenu(user)
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(labels).toEqual(['Sacar foto', 'Por voz', 'Manual'])
    expect(screen.queryByText('Subir archivo')).not.toBeInTheDocument()
    // Focus lands inside the menu.
    expect(screen.getByRole('menuitem', { name: 'Sacar foto' })).toHaveFocus()
  })

  it('moves focus with the arrow keys, Home and End', async () => {
    const { user } = renderQuickAdd()
    await openMenu(user)
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Por voz' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Manual' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sacar foto' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Manual' })).toHaveFocus()
  })

  it('closes with Escape, the backdrop and a second tap on the cat, and gives focus back to it', async () => {
    const { user } = renderQuickAdd()
    const fab = screen.getByRole('button', { name: 'Nuevo movimiento' })

    await openMenu(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(fab).toHaveFocus()

    await openMenu(user)
    await user.click(screen.getByRole('button', { name: 'Cerrar menú de movimientos' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await openMenu(user)
    await user.click(screen.getByTestId('add-menu-backdrop'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(fab).toHaveFocus()
  })

  it('"Manual" opens the usual new-movement sheet', async () => {
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Manual' }))
    expect(openNew).toHaveBeenCalledTimes(1)
    expect(openNew).toHaveBeenCalledWith()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('"Por voz" opens the voice conversation with the cat', async () => {
    const { user } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Por voz' }))
    expect(screen.getByRole('dialog', { name: 'Carga por voz' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('"Sacar foto" opens the camera / file picker', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderQuickAdd()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Sacar foto' }))
    expect(click).toHaveBeenCalledTimes(1)
    const input = screen.getByTestId('receipt-input')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
  })

  it('offline: photo and voice are disabled with the offline notice, manual stays available', async () => {
    act(() => onlineManager.setOnline(false))
    const { user, openNew } = renderQuickAdd()
    await openMenu(user)
    expect(screen.getByRole('menuitem', { name: 'Sacar foto' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Por voz' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Manual' })).toBeEnabled()
    expect(screen.getByText('Sin conexión. Conectate para guardar cambios.')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Manual' }))
    expect(openNew).toHaveBeenCalled()
  })
})

describe('QuickAdd receipt scan', () => {
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
    await user.click(screen.getByRole('button', { name: 'Confirmar gasto' }))
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
