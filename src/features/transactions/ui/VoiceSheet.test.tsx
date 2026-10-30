import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { onlineManager } from '@tanstack/react-query'
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
    creditLimitCents: null,
    closingDay: null,
    dueDay: null,
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

/** The dictation ends by itself (silence): the browser reports it. */
function finishListening(index = 0) {
  act(() => FakeRecognition.instances[index]?.onend?.())
}

async function reachConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
  act(() => FakeRecognition.instances[0]?.say('gasté 5 lucas en el bondi y 18 en el almuerzo'))
  finishListening()
  await user.click(screen.getByRole('button', { name: 'Listo' }))
  await screen.findByText('Revisá y guardá')
}

beforeEach(() => {
  plusState.isFree = false
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
  it('falls back to a text box when speech recognition is unsupported', () => {
    delete (window as unknown as SpeechWindow).webkitSpeechRecognition
    renderSheet()
    expect(screen.getByRole('textbox', { name: /Lo que gastaste o cobraste/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar micrófono' })).not.toBeInTheDocument()
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

  it('starts with the cat and no text form, only a prompt and a button to speak', () => {
    renderSheet()
    expect(screen.getByText(/Contame qué gastaste o cobraste/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument()
    expect(screen.queryByText('Terminé')).not.toBeInTheDocument()
    expect(document.querySelector('svg.fortune-cat')).not.toHaveAttribute('data-mode')
  })

  it('the cat listens only while the microphone is on, with the words in a bubble', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))

    const recognition = FakeRecognition.instances[0]
    expect(recognition?.start).toHaveBeenCalled()
    expect(recognition?.lang).toBe('es-AR')
    expect(screen.getAllByText(/Escuchando/).length).toBeGreaterThan(0)
    expect(document.querySelector('svg.fortune-cat')).toHaveAttribute('data-mode', 'listening')

    act(() => recognition?.say('gasté 5 lucas en el bondi'))
    expect(screen.getByLabelText('Lo que se va entendiendo')).toHaveTextContent(
      'gasté 5 lucas en el bondi',
    )

    finishListening()
    expect(document.querySelector('svg.fortune-cat')).not.toHaveAttribute('data-mode')
    // Nothing is interpreted until "Listo".
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('shows the whole transcript with Editar, Volver a grabar and Eliminar; Listo shows the movements', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    act(() => FakeRecognition.instances[0]?.say('gasté 5 lucas en el bondi y 18 en el almuerzo'))
    finishListening()

    expect(screen.getByText(/“gasté 5 lucas en el bondi y 18 en el almuerzo”/)).toBeInTheDocument()
    for (const name of ['Editar', 'Volver a grabar', 'Eliminar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByRole('listitem', { name: 'Movimiento 1' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Movimiento 2' })).toBeInTheDocument()
    // Compact cards: the amount and the note up front, the rest in small dropdowns.
    expect(
      screen.getByRole('button', { name: 'Monto del movimiento 1: $5.000' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nota del movimiento 2: Almuerzo' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría del movimiento 1')).toHaveDisplayValue('Transporte')
    expect(screen.getByLabelText('Cuenta del movimiento 1')).toHaveDisplayValue('Efectivo')
    expect(screen.getByLabelText('Fecha del movimiento 1')).toHaveValue('2026-10-27')
    expect(screen.getByText(/2 movimientos · Salen \$23\.000/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar movimientos' })).toBeInTheDocument()
    // No category could be told: it says so instead of inventing one.
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('Editar lets the person fix the words before they are interpreted', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    act(() => FakeRecognition.instances[0]?.say('gasté 5 lucas en el bondi'))
    finishListening()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const box = screen.getByRole('textbox')
    expect(box).toHaveValue('gasté 5 lucas en el bondi')
    await user.type(box, ' y 18 mil de almuerzo')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await screen.findByText('Revisá y guardá')
    expect(mocks.invoke).toHaveBeenCalledWith('parse-movements', {
      body: {
        text: 'gasté 5 lucas en el bondi y 18 mil de almuerzo',
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    })
  })

  it('Volver a grabar listens again and Eliminar throws the recording away', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    act(() => FakeRecognition.instances[0]?.say('uno'))
    finishListening()
    await user.click(screen.getByRole('button', { name: 'Volver a grabar' }))
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(screen.getAllByText(/Escuchando/).length).toBeGreaterThan(0)
    act(() => FakeRecognition.instances[1]?.say('dos'))
    finishListening()
    expect(screen.getByText(/“dos”/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText(/Contame qué gastaste o cobraste/)).toBeInTheDocument()
    expect(screen.queryByText(/“dos”/)).not.toBeInTheDocument()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('says so when nothing was heard', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    finishListening()
    expect(await screen.findByText(/No te escuché/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir' })).toBeInTheDocument()
  })

  it('applies edits to the saved payload, sends integer cents and creates N transactions', async () => {
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)

    await user.click(screen.getByRole('button', { name: /^Monto del movimiento 1/ }))
    const amount = screen.getByLabelText('Monto del movimiento 1')
    await user.clear(amount)
    await user.type(amount, '6.250,50')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: /^Nota del movimiento 1/ }))
    const note = screen.getByLabelText('Nota del movimiento 1')
    await user.clear(note)
    await user.type(note, 'Bondi de ida')
    await user.keyboard('{Enter}')
    await user.selectOptions(screen.getByLabelText('Categoría del movimiento 2'), 'Comida')
    fireEvent.change(screen.getByLabelText('Fecha del movimiento 2'), {
      target: { value: '2026-10-20' },
    })
    await user.click(screen.getByRole('button', { name: 'Confirmar movimientos' }))

    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(2))
    expect(mocks.createTransaction.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      amount: 625_050,
      categoryId: TRANSPORT_ID,
      accountId: ACCOUNT_ID,
      note: 'Bondi de ida',
      occurredOn: '2026-10-27',
    })
    expect(mocks.createTransaction.mock.calls[1]?.[0]).toMatchObject({
      amount: 1_800_000,
      categoryId: FOOD_ID,
      occurredOn: '2026-10-20',
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('blocks saving while a draft has no category and removes drafts on request', async () => {
    const { user } = renderSheet()
    await reachConfirmation(user)

    await user.click(screen.getByRole('button', { name: 'Confirmar movimientos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí una categoría.')
    expect(mocks.createTransaction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Quitar movimiento 2' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar gasto' }))
    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1))
  })

  it('switching the kind clears an incompatible category', async () => {
    const { user } = renderSheet()
    await reachConfirmation(user)
    const group = within(screen.getByRole('group', { name: 'Tipo del movimiento 1' }))
    await user.click(group.getByRole('button', { name: 'Ingreso' }))
    const select = screen.getByLabelText('Categoría del movimiento 1')
    expect(within(select).queryByRole('option', { name: 'Transporte' })).not.toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Sueldo' })).toBeInTheDocument()
    expect(select).toHaveDisplayValue('Elegir categoría')
  })

  it('keeps only the failed items and reports their error when a save fails', async () => {
    mocks.createTransaction.mockResolvedValueOnce(undefined).mockRejectedValueOnce({
      code: '42501',
      message: 'permission denied',
    })
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)
    await user.selectOptions(screen.getByLabelText('Categoría del movimiento 2'), 'Comida')
    await user.click(screen.getByRole('button', { name: 'Confirmar movimientos' }))

    expect(await screen.findByText('No tenés permiso para hacer eso.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar gasto' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nota del movimiento 1: Almuerzo' }),
    ).toBeInTheDocument()
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

  it('Descartar throws the movements away without saving and keeps the transcript to try again', async () => {
    const { user, onClose } = renderSheet()
    await reachConfirmation(user)
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByText('Te escuché decir:')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('a single movement says Confirmar gasto / Confirmar ingreso and lets the type be switched', async () => {
    mocks.invoke.mockResolvedValue({
      data: { movements: [RESPONSE.movements[0]], warnings: [] },
      error: null,
    })
    const { user } = renderSheet({ startWith: 'text' })
    await user.type(screen.getByRole('textbox'), '5 lucas bondi')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByRole('button', { name: 'Confirmar gasto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Quitar movimiento/ })).not.toBeInTheDocument()
    await user.click(
      within(screen.getByRole('group', { name: 'Tipo del movimiento 1' })).getByRole('button', {
        name: 'Ingreso',
      }),
    )
    expect(screen.getByRole('button', { name: 'Confirmar ingreso' })).toBeInTheDocument()
  })

  it('never invents the account: with several accounts and none named, the person has to pick one', async () => {
    const second: Account = {
      ...(accounts[0] as Account),
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Banco',
    }
    accounts.push(second)
    try {
      mocks.invoke.mockResolvedValue({
        data: { movements: [{ ...RESPONSE.movements[0], accountId: null }], warnings: [] },
        error: null,
      })
      const { user } = renderSheet({ startWith: 'text' })
      await user.type(screen.getByRole('textbox'), '5 lucas bondi')
      await user.click(screen.getByRole('button', { name: 'Listo' }))
      const select = await screen.findByLabelText('Cuenta del movimiento 1')
      expect(select).toHaveDisplayValue('Elegir cuenta')
      await user.click(screen.getByRole('button', { name: 'Confirmar gasto' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Elegí una cuenta.')
      expect(mocks.createTransaction).not.toHaveBeenCalled()
      await user.selectOptions(select, 'Banco')
      await user.click(screen.getByRole('button', { name: 'Confirmar gasto' }))
      await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1))
      expect(mocks.createTransaction.mock.calls[0]?.[0]).toMatchObject({ accountId: second.id })
    } finally {
      accounts.pop()
    }
  })

  it('picks "Otros" when the AI cannot tell the category and the person has it', async () => {
    const others = cat('66666666-6666-4666-8666-666666666666', 'Otros', 'expense')
    categories.push(others)
    try {
      const { user } = renderSheet()
      await reachConfirmation(user)
      expect(screen.getByLabelText('Categoría del movimiento 2')).toHaveDisplayValue('Otros')
    } finally {
      categories.pop()
    }
  })

  it('cancelling while dictating stops the microphone and saves nothing', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar escucha' }))
    expect(FakeRecognition.instances[0]?.stop).toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('tells the person when the microphone is denied and offers to type instead', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
    act(() => FakeRecognition.instances[0]?.onerror?.({ error: 'not-allowed' }))
    expect(await screen.findByText(/No pude usar el micrófono/)).toBeInTheDocument()
    expect(document.querySelector('svg.fortune-cat')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Escribir' }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(document.querySelector('svg.fortune-cat')).toBeInTheDocument()
  })

  describe('opening', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
    })
    function withPermission(state: 'granted' | 'prompt' | 'denied') {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn().mockResolvedValue({ state }) },
        configurable: true,
      })
    }

    it('listens by itself when the browser already has the microphone permission', async () => {
      withPermission('granted')
      renderSheet()
      await waitFor(() => expect(FakeRecognition.instances[0]?.start).toHaveBeenCalled())
      expect(await screen.findByText('Te escucho…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Activar micrófono' })).not.toBeInTheDocument()
    })

    it('asks with a small button, and no error, when the permission is still to be given', async () => {
      withPermission('prompt')
      renderSheet()
      expect(await screen.findByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument()
      expect(FakeRecognition.instances).toHaveLength(0)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('waits through a pause between expenses and stops after a longer silence', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { user } = renderSheet()
      await user.click(screen.getByRole('button', { name: 'Activar micrófono' }))
      act(() => FakeRecognition.instances[0]?.say('gasté 5 lucas en el bondi'))
      act(() => vi.advanceTimersByTime(4000))
      expect(FakeRecognition.instances[0]?.stop).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1000))
      expect(FakeRecognition.instances[0]?.stop).toHaveBeenCalled()
      expect(await screen.findByText('Te escuché decir:')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('offline: it can still be typed, but Listo is blocked with the offline notice', async () => {
    act(() => onlineManager.setOnline(false))
    try {
      const { user } = renderSheet({ startWith: 'text' })
      await user.type(screen.getByRole('textbox'), 'Gasté $8.000 en el súper')
      expect(screen.getByRole('button', { name: 'Listo' })).toBeDisabled()
      expect(screen.getByText('Sin conexión. Conectate para guardar cambios.')).toBeInTheDocument()
      expect(mocks.invoke).not.toHaveBeenCalled()
    } finally {
      act(() => onlineManager.setOnline(true))
    }
  })

  it('the text box suggests the short example as a placeholder, not as prefilled text', () => {
    renderSheet({ startWith: 'text' })
    const box = screen.getByRole('textbox')
    expect(box).toHaveAttribute('placeholder', 'Gasté $8.000 en el súper')
    expect(box).toHaveValue('')
  })

  it('closes with Escape without saving anything', async () => {
    const { user, onClose } = renderSheet()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })
})

describe('VoiceSheet free plan gate', () => {
  it('shows the Plus upsell instead of the capability and never starts the microphone', () => {
    plusState.isFree = true
    renderSheet()
    expect(
      screen.getByRole('dialog', { name: /Cargar por voz es de Moni Plus/ }),
    ).toBeInTheDocument()
    expect(FakeRecognition.instances).toHaveLength(0)
  })

  it('switches to the upsell when the server answers 402 plus_required', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'plus_required' }), { status: 402 }),
      ),
    })
    const { user } = renderSheet({ startWith: 'text' })
    await user.type(screen.getByLabelText('Lo que gastaste o cobraste'), 'gasté 5 lucas')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(
      await screen.findByRole('dialog', { name: /Cargar por voz es de Moni Plus/ }),
    ).toBeInTheDocument()
  })
})
