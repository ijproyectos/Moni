import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { AssistantPage } from './AssistantPage'

const invoke = vi.hoisted(() => vi.fn())
const plusState = vi.hoisted(() => ({ isFree: false, isPlus: true }))
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke }, rpc: vi.fn() }),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ isLoading: false, expiresAt: null, ...plusState }),
  useRedeemPromoCode: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
}))

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('AssistantPage', () => {
  beforeEach(() => {
    invoke.mockReset()
    Object.assign(plusState, { isFree: false, isPlus: true })
  })

  it('shows the five suggested questions and answers a tap', async () => {
    invoke.mockResolvedValue({ data: { reply: 'Gastaste $5.000 este mes.' }, error: null })
    const user = setup()
    expect(screen.getAllByRole('button', { name: /\?$/ })).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: '¿Cuánto gasté este mes?' }))
    expect(await screen.findByText(/Gastaste \$5\.000 este mes\./)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Preguntas sugeridas' })).not.toBeInTheDocument()
  })

  it('sends typed questions with the send button and disables it while empty', async () => {
    invoke.mockResolvedValue({ data: { reply: 'Listo' }, error: null })
    const user = setup()
    const send = screen.getByRole('button', { name: 'Enviar' })
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText('Tu pregunta'), '¿Qué vence?')
    await user.click(send)
    expect(await screen.findByText('Listo')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu pregunta')).toHaveValue('')
  })

  it('shows the loading state while Moni answers', async () => {
    let resolve: (v: unknown) => void = () => {}
    invoke.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = setup()
    await user.click(screen.getByRole('button', { name: '¿Qué vence esta semana?' }))
    expect(screen.getByRole('status')).toHaveTextContent(/Moni está mirando/)
    resolve({ data: { reply: 'Nada' }, error: null })
    expect(await screen.findByText('Nada')).toBeInTheDocument()
  })

  it('shows the quota error with a retry', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(429, { error: 'ai_quota_exceeded' }) })
    const user = setup()
    await user.click(screen.getByRole('button', { name: '¿Cuánto gasté este mes?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/límite de preguntas/)
    invoke.mockResolvedValueOnce({ data: { reply: 'Ahora sí' }, error: null })
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ahora sí')).toBeInTheDocument()
  })

  it('shows a generic error for server failures', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(502, { error: 'ai_unavailable' }) })
    const user = setup()
    await user.click(screen.getByRole('button', { name: '¿Cuánto gasté este mes?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudo responder/)
  })

  it('opens the Plus sheet when the server answers 402', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(402, { error: 'plus_required' }) })
    const user = setup()
    await user.click(screen.getByRole('button', { name: '¿Cuánto gasté este mes?' }))
    expect(await screen.findByRole('dialog', { name: 'El asistente es de Moni Plus' })).toBeInTheDocument()
  })

  it('gates Free users with the upsell and never calls the function', async () => {
    Object.assign(plusState, { isFree: true, isPlus: false })
    const user = setup()
    expect(screen.queryByLabelText('Tu pregunta')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Conocer Moni Plus' }))
    expect(screen.getByRole('dialog', { name: 'El asistente es de Moni Plus' })).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })
})
