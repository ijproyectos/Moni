import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { MovementSheetContext } from '@/features/transactions/ui/movementSheetContext'
import { MoniAgent } from '@/features/assistant/ui/MoniAgent'
import { clearAssistantMemory } from '@/features/assistant/api/useAssistantChat'

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
vi.mock('@/features/transactions/api/transactionsRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/transactions/api/transactionsRepository')>()),
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

function renderAgent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MovementSheetContext.Provider value={{ openNew: vi.fn(), openEdit: vi.fn() }}>
        <MoniAgent name="Iara" />
      </MovementSheetContext.Provider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const cat = () => screen.getByRole('button', { name: 'Hablá con Moni' })

function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy })
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy })
}

beforeEach(() => {
  plusState.isFree = false
  clearAssistantMemory()
  sessionStorage.clear()
  mocks.invoke.mockReset()
  mocks.createTransaction.mockReset()
  mocks.createTransaction.mockResolvedValue(undefined)
  mocks.listTransactions.mockReset()
  mocks.listTransactions.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MoniAgent (the floating cat)', () => {
  it('the button does not clip the cat on top (ears) nor at the sides, only the empty strip that would cover the bar', () => {
    renderAgent()
    expect(cat().className).toContain('[clip-path:inset(-60px_-60px_6px_-60px)]')
  })

  it('is one cat, the full-body animated one, floating over the page', () => {
    renderAgent()
    expect(screen.getAllByRole('button', { name: 'Hablá con Moni' })).toHaveLength(1)
    const live = screen.getByTestId('moni-cat-live')
    expect(live.parentElement).toHaveClass('motion-safe:animate-[moni-float_3.6s_ease-in-out_infinite]')
    // Parts that move on their own, so the cat is not one rigid piece.
    for (const part of ['mc-head', 'mc-ear-l', 'mc-ear-r', 'mc-eyes', 'mc-lids', 'mc-tail', 'mc-breath', 'mc-paw']) {
      expect(live.querySelector(`.${part}`)).not.toBeNull()
    }
  })

  it('a tap opens the chat; a drag moves the cat and does not open it', async () => {
    renderAgent()
    drag(cat(), 60, 40)
    fireEvent.click(cat())
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.pointerDown(cat(), { pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(cat(), { pointerId: 2, clientX: 12, clientY: 11 })
    fireEvent.click(cat())
    expect(screen.getByRole('dialog', { name: 'Moni' })).toBeInTheDocument()
  })

  it('also opens with the keyboard', async () => {
    const user = renderAgent()
    cat().focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Moni' })).toBeInTheDocument()
  })

  it('a drag never takes the cat out of the screen, and it can go down to the top of the bottom bar', () => {
    const rect = (top: number, height: number, width = 390) =>
      ({ width, height, top, left: 0, right: width, bottom: top + height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'NAV' ? rect(740, 60) : rect(0, 800)
    })
    render(
      <>
        <nav aria-label="Navegación principal" />
        <QueryClientProvider client={new QueryClient()}>
          <MovementSheetContext.Provider value={{ openNew: vi.fn(), openEdit: vi.fn() }}>
            <MoniAgent name="Iara" />
          </MovementSheetContext.Provider>
        </QueryClientProvider>
      </>,
    )
    const box = () => cat().parentElement as HTMLElement
    // Paws 6px above the bar (740): box top = 740 - 6 - 0.917 * 132 -> 612. Right edge of the drawing 12px from the side.
    expect(box().style.left).toBe('261px')
    expect(box().style.top).toBe('612px')
    drag(cat(), -200, -300)
    expect(box().style.left).toBe('61px')
    expect(box().style.top).toBe('312px')
    expect(sessionStorage.getItem('moni.agent.position')).not.toBeNull()
    drag(cat(), 2000, 2000)
    expect(box().style.left).toBe('261px')
    expect(box().style.top).toBe('612px')
    // Top-left: the ears (lifted 7px by the float) stay 60px under the top, the drawn left side 12px from the edge.
    drag(cat(), -2000, -2000)
    expect(box().style.left).toBe('-20px')
    expect(box().style.top).toBe('64px')
  })

  it('without the bar (keyboard open) it keeps a small distance from the bottom', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 390, height: 800, top: 0, left: 0, right: 390, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    })
    renderAgent()
    expect((cat().parentElement as HTMLElement).style.top).toBe('666px')
  })

  it('says the first phrase 8 s after arriving, keeps it 3 s, then speaks again 12–15 s after it appeared', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    renderAgent()
    act(() => void vi.advanceTimersByTime(7900))
    expect(screen.queryByTestId('moni-bubble')).toBeNull()
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-100', 'pointer-events-none')
    expect(screen.getByTestId('moni-bubble').textContent).toMatch(/\S/)
    act(() => void vi.advanceTimersByTime(2800))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-100')
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-0')
    act(() => void vi.advanceTimersByTime(8000))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-0')
    act(() => void vi.advanceTimersByTime(4000))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-100')
  })

  it('does not speak while the tab is in the background', () => {
    vi.useFakeTimers()
    renderAgent()
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.queryByTestId('moni-bubble')).toBeNull()
    state.mockReturnValue('visible')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void vi.advanceTimersByTime(12_500))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-100')
  })

  it('the next phrase is never the same as the one before', () => {
    vi.useFakeTimers()
    renderAgent()
    const seen: string[] = []
    for (let i = 0; i < 8; i++) {
      act(() => void vi.advanceTimersByTime(i === 0 ? 8500 : 15_000))
      seen.push(screen.getByTestId('moni-bubble').textContent ?? '')
    }
    seen.slice(1).forEach((p, i) => expect(p).not.toBe(seen[i]))
  })

  it('pauses the phrases while the chat is open and goes on when it closes', () => {
    vi.useFakeTimers()
    renderAgent()
    act(() => void vi.advanceTimersByTime(8500))
    fireEvent.pointerDown(cat(), { pointerId: 5, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(cat(), { pointerId: 5, clientX: 10, clientY: 10 })
    fireEvent.click(cat())
    expect(screen.getByRole('dialog', { name: 'Moni' })).toBeInTheDocument()
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-0')
    const frozen = screen.getByTestId('moni-bubble').textContent
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-0')
    expect(screen.getByTestId('moni-bubble').textContent).toBe(frozen)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    act(() => void vi.advanceTimersByTime(8500))
    expect(screen.getByTestId('moni-bubble')).toHaveClass('opacity-100')
  })
})

describe('Moni chat (opened from the cat)', () => {
  it('keeps the header (title and X) and the box outside the scrolling messages', async () => {
    const user = renderAgent()
    await user.click(cat())
    const dialog = screen.getByRole('dialog', { name: 'Moni' })
    const log = within(dialog).getByRole('log', { name: 'Conversación con Moni' })
    const scroller = log.parentElement as HTMLElement
    expect(scroller).toHaveClass('overflow-y-auto')
    expect(scroller).not.toContainElement(within(dialog).getByRole('button', { name: 'Cerrar' }))
    // The little cat is in the header, and the sheet opens small (it is not a full-height screen).
    expect(dialog.querySelector('img')?.getAttribute('src')).toMatch(/moni-gato-fortuna-animado.*\.svg/)
    expect(dialog).not.toHaveClass('h-full')
    expect(scroller).not.toContainElement(within(dialog).getByLabelText('Tu pregunta'))
  })

  it('a written expense is read and offered for review (nothing is saved yet)', async () => {
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
    const user = renderAgent()
    await user.click(cat())
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
    const user = renderAgent()
    await user.click(cat())
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Cuánto tengo?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Tenés $5.000')).toBeInTheDocument()
    expect(mocks.invoke).not.toHaveBeenCalledWith('parse-movements', expect.anything())
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Y en el banco?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findAllByText('Tenés $5.000')
    const body = (mocks.invoke.mock.calls[1]?.[1] as { body: { messages: unknown[] } }).body
    expect(body.messages).toHaveLength(3)
  })

  it('closing and opening again does not lose the conversation', async () => {
    mocks.invoke.mockResolvedValue({ data: { reply: 'Tenés $5.000' }, error: null })
    const user = renderAgent()
    await user.click(cat())
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Cuánto tengo?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText('Tenés $5.000')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(cat())
    expect(screen.getByText('Tenés $5.000')).toBeInTheDocument()
    expect(screen.getByText('¿Cuánto tengo?', { selector: 'p' })).toBeInTheDocument()
  })

  it('the chat is Plus: a free user sees the upsell and nothing is sent', async () => {
    plusState.isFree = true
    const user = renderAgent()
    await user.click(cat())
    expect(screen.getByText('El asistente es de Moni Plus')).toBeInTheDocument()
    expect(mocks.invoke).not.toHaveBeenCalledWith('parse-movements', expect.anything())
  })
})
