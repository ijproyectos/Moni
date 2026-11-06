import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { HomeHeader } from './HomeHeader'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke }, rpc: vi.fn() }),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ isLoading: false, expiresAt: null, isFree: false, isPlus: true }),
  useRedeemPromoCode: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
}))

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HiddenAmountsProvider>
          <HomeHeader
            month="2026-10-01"
            latestMonth="2026-10-01"
            onMonthChange={vi.fn()}
            initial="I"
            name="Iara"
            availableCents={568_000_00}
            incomeCents={100_000_00}
            expenseCents={112_500_00}
          />
        </HiddenAmountsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('HomeHeader: the cat opens the "Preguntale a Moni" sheet', () => {
  beforeEach(() => invoke.mockReset())

  it('opens a sheet (not a page) with the title, subtitle, greeting and the four quick questions', async () => {
    const user = setup()
    const cat = screen.getByRole('button', { name: 'Preguntale a Moni' })
    expect(screen.queryByRole('link', { name: 'Preguntale a Moni' })).toBeNull()
    await user.click(cat)
    const sheet = screen.getByRole('dialog', { name: 'Preguntale a Moni' })
    expect(sheet).toHaveTextContent('Respondo con los números de tu cuenta')
    expect(sheet).toHaveTextContent('Hola, Iara.')
    for (const question of [
      '¿En qué gasté más?',
      '¿Cuánto pago de suscripciones?',
      '¿Cuánto debo?',
      '¿Cuánto tengo?',
    ]) {
      expect(screen.getByRole('button', { name: question })).toBeInTheDocument()
    }
  })

  it('a quick question goes through the real assistant and shows its answer', async () => {
    invoke.mockResolvedValue({ data: { reply: 'Gastaste más en Comida.' }, error: null })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Preguntale a Moni' }))
    await user.click(screen.getByRole('button', { name: '¿En qué gasté más?' }))
    expect(await screen.findByText('Gastaste más en Comida.')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0]?.[0]).toBe('insights-chat')
  })

  it('closes with the button, Escape, a tap outside, or by dragging the grabber down', async () => {
    const user = setup()
    const open = () => user.click(screen.getByRole('button', { name: 'Preguntale a Moni' }))
    const gone = () => expect(screen.queryByRole('dialog')).toBeNull()

    await open()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    gone()

    await open()
    await user.keyboard('{Escape}')
    gone()

    await open()
    await user.click(document.querySelector('.bg-scrim') as HTMLElement)
    gone()

    await open()
    const grabber = document.querySelector('[data-sheet-grabber]') as HTMLElement
    fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 120, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 120, pointerId: 1 })
    expect(screen.getByRole('dialog')).toBeInTheDocument() // too short: it springs back
    fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 230, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 230, pointerId: 1 })
    gone()
  })
})
