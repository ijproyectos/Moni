import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AuthContext, type AuthState } from '@/features/auth/api/authContext'
import { SupportPage } from './SupportPage'

const rpc = vi.hoisted(() => vi.fn())
const rows = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({
    rpc,
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: rows.value, error: null }) }),
      }),
    }),
  }),
}))

const user = { id: 'user-a' } as NonNullable<AuthState['user']>
const session = { user } as NonNullable<AuthState['session']>

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, user, isLoading: false }}>
        <MemoryRouter>
          <SupportPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  subject: 'No me carga un gasto',
  message: 'Pasa en Actividad.',
  status: 'open',
  reply: null,
  replied_at: null,
  created_at: '2026-11-02T15:00:00Z',
  ...over,
})

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 'new-id', error: null })
  rows.value = []
})

describe('SupportPage', () => {
  it('tells the person who reads the message and sends a valid ticket', async () => {
    const user = setup()
    expect(screen.getByText(/la lee el equipo de Moni/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Asunto'), '  Un problema  ')
    await user.type(screen.getByLabelText('Mensaje'), 'No puedo cargar un gasto')
    await user.click(screen.getByRole('button', { name: 'Enviar consulta' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_support_ticket', {
        p_subject: 'Un problema',
        p_message: 'No puedo cargar un gasto',
      }),
    )
    await waitFor(() => expect(screen.getByLabelText('Asunto')).toHaveValue(''))
  })

  it('does not send an invalid ticket and says what is missing', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Asunto'), 'ab')
    await user.click(screen.getByRole('button', { name: 'Enviar consulta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El asunto necesita al menos 3 letras.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains the daily limit', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'too_many_tickets' } })
    const user = setup()
    await user.type(screen.getByLabelText('Asunto'), 'Un problema')
    await user.type(screen.getByLabelText('Mensaje'), 'Texto')
    await user.click(screen.getByRole('button', { name: 'Enviar consulta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya enviaste 5 consultas')
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Texto')
  })

  it('lists my tickets with their status and the team answer', async () => {
    rows.value = [
      ticket({ id: 't2', subject: 'Respondida', status: 'open', reply: 'Ya lo arreglamos.' }),
      ticket({ id: 't1', subject: 'Sin respuesta' }),
    ]
    setup()
    const heading = await screen.findByRole('heading', { name: 'Respondida' })
    const answered = heading.parentElement?.parentElement as HTMLElement
    expect(within(answered).getByText('Respondida', { selector: 'span' })).toBeInTheDocument()
    expect(within(answered).getByText('Ya lo arreglamos.')).toBeInTheDocument()
    expect(screen.getByText('Abierta')).toBeInTheDocument()
  })

  it('says so when there are no tickets yet', async () => {
    setup()
    expect(await screen.findByText('Todavía no enviaste ninguna consulta.')).toBeInTheDocument()
  })
})
