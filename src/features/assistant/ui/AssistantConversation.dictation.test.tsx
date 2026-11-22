import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AssistantConversation } from './AssistantConversation'

const send = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ isLoading: false, isPlus: true, isFree: false, expiresAt: null }),
  useRedeemPromoCode: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
}))
vi.mock('../api/useAssistantChat', () => ({
  useAssistantChat: () => ({
    messages: [],
    isPending: false,
    plusRequired: false,
    error: null,
    send,
    append: vi.fn(),
    clear: vi.fn(),
    retry: vi.fn(),
  }),
}))
vi.mock('@/features/ai/api/useParseMovements', () => ({ useParseMovements: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))

class Fake {
  static instances: Fake[] = []
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    Fake.instances.push(this)
  }
  say(...parts: string[]) {
    this.onresult?.({ results: parts.map((transcript) => ({ isFinal: true, 0: { transcript } })) })
  }
}
const session = () => Fake.instances[Fake.instances.length - 1] as Fake
const win = window as unknown as Record<string, unknown>

function renderChat() {
  render(
    <MemoryRouter>
      <AssistantConversation memoryKey="k" suggestions={[]} greeting="hola" />
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const mic = () => screen.getByRole('button', { name: /Dictar pregunta|Detener dictado/ })
const box = () => screen.getByLabelText('Tu pregunta') as HTMLInputElement

beforeEach(() => {
  Fake.instances = []
  send.mockClear()
  win.webkitSpeechRecognition = Fake
})
afterEach(() => {
  delete win.webkitSpeechRecognition
})

describe('Dictating in the chat', () => {
  it('shows "Escuchando…" while it listens and a cancel button', async () => {
    const user = renderChat()
    expect(screen.queryByText('Escuchando…')).toBeNull()
    await user.click(mic())
    expect(screen.getByRole('status')).toHaveTextContent('Escuchando…')
    expect(screen.getByRole('button', { name: 'Detener dictado' })).toHaveAttribute('aria-pressed', 'true')
    expect(box()).toHaveAttribute('readonly')
  })

  it('adds the dictation after what was written, without repeating words from partial and final results', async () => {
    const user = renderChat()
    await user.type(box(), 'Gasté $500 en')
    await user.click(mic())
    act(() => session().say('el'))
    act(() => session().say('el supermercado'))
    act(() => session().say('el', 'el supermercado'))
    expect(box().value).toBe('Gasté $500 en el supermercado')
  })

  it('stopping shows "Procesando…" and then leaves the text in the box, not sent', async () => {
    const user = renderChat()
    await user.click(mic())
    act(() => session().say('cuánto gasté hoy'))
    await user.click(screen.getByRole('button', { name: 'Detener dictado' }))
    expect(screen.getByRole('status')).toHaveTextContent('Procesando…')
    act(() => session().onend?.())
    expect(screen.queryByRole('status')).toBeNull()
    expect(box().value).toBe('cuánto gasté hoy')
    expect(send).not.toHaveBeenCalled()
  })

  it('Cancelar closes the microphone and gives back what was written before', async () => {
    const user = renderChat()
    await user.type(box(), 'Gasté $500 en')
    await user.click(mic())
    act(() => session().say('el super'))
    expect(box().value).toBe('Gasté $500 en el super')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(session().abort).toHaveBeenCalled()
    expect(box().value).toBe('Gasté $500 en')
    expect(screen.queryByRole('status')).toBeNull()
    expect(box()).not.toHaveAttribute('readonly')
  })

  it('sending is manual: after dictating, the person presses Enviar', async () => {
    const user = renderChat()
    await user.click(mic())
    act(() => session().say('cuánto gasté hoy'))
    act(() => session().onend?.())
    expect(send).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(send).toHaveBeenCalledWith('cuánto gasté hoy')
  })

  it.each([
    ['not-allowed', /micrófono está bloqueado/],
    ['service-not-allowed', /dictado de tu dispositivo no está activo/],
    ['audio-capture', /No encuentro un micrófono/],
    ['network', /No pude conectarme con el servicio de voz/],
    ['no-speech', /No te escuché/],
  ])('shows what happened with %s and the microphone stops looking active', async (code, message) => {
    const user = renderChat()
    await user.click(mic())
    act(() => session().onerror?.({ error: code }))
    act(() => session().onend?.())
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText('Escuchando…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Dictar pregunta' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a browser without speech recognition keeps the button and explains why when it is tapped', async () => {
    delete win.webkitSpeechRecognition
    const user = renderChat()
    await user.click(mic())
    expect(screen.getByRole('alert')).toHaveTextContent(/no permite dictar por voz/)
    expect(box()).not.toHaveAttribute('readonly')
  })
})
