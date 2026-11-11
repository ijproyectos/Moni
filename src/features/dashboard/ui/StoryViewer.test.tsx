import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Story } from '../domain/stories'
import { StoryViewer } from './StoryViewer'

vi.mock('@/features/goals/ui/SavingsNotices', () => ({
  SavingsNotices: () => <p>avisos de ahorro</p>,
}))
vi.mock('@/features/recurring/ui/RecurringReminders', () => ({
  RecurringReminders: () => <p>pagos próximos</p>,
}))

const story = (id: string, slides: Story['slides']): Story => ({
  id,
  signature: id,
  label: id.toUpperCase(),
  bubble: '1',
  tone: 'blue',
  priority: 1,
  slides,
})
const metas = story('metas', [
  {
    title: 'Metas',
    figure: '$80.000',
    body: 'Este mes te faltan $80.000.',
    lines: ['Computadora'],
    action: { label: 'Ver mi meta', to: '/metas/g1' },
  },
  { title: 'Casi llegás', body: 'Te faltan $5.000.' },
])
const gastos = story('gastos', [{ title: 'Gastos', body: 'El 51% fue compartido.' }])

let reduced = false
beforeEach(() => {
  reduced = false
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
})

function setup(stories: Story[] = [metas, gastos], start = 0) {
  const onClose = vi.fn()
  const onViewed = vi.fn()
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <StoryViewer
              stories={stories}
              startIndex={start}
              onClose={onClose}
              onViewed={onViewed}
            />
          }
        />
        <Route path="/metas/:id" element={<p>detalle de meta</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { onClose, onViewed, user: userEvent.setup() }
}

describe('StoryViewer', () => {
  it('shows the title, figure, what Moni says and the action, as a modal dialog', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Historia: METAS' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Metas')
    expect(dialog).toHaveTextContent('$80.000')
    expect(dialog).toHaveTextContent('Este mes te faltan $80.000.')
    expect(dialog).toHaveTextContent('Computadora')
    expect(screen.getByRole('link', { name: 'Ver mi meta' })).toHaveAttribute('href', '/metas/g1')
  })

  it('marks as seen the story that is on screen', async () => {
    const { onViewed, user } = setup()
    expect(onViewed).toHaveBeenCalledWith(metas)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onViewed).toHaveBeenCalledWith(gastos)
  })

  it('the progress has one bar per story, and tapping right and left moves through the slides', async () => {
    const { user } = setup()
    const progress = () => screen.getByRole('progressbar', { name: 'Avance de la historia' })
    expect(progress()).toHaveAttribute('aria-valuenow', '1')
    expect(progress()).toHaveAttribute('aria-valuemax', '2')
    expect(progress().children).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    // Still the first story: its second slide.
    expect(progress()).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('dialog')).toHaveTextContent('Casi llegás')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(progress()).toHaveAttribute('aria-valuenow', '2')
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(progress()).toHaveAttribute('aria-valuenow', '1')
  })

  it('goes on to the next story after the last slide, and closes after the last one', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByRole('dialog', { name: 'Historia: GASTOS' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByRole('dialog', { name: 'Historia: METAS' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with the button', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Cerrar historia' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('arrow keys move between slides', async () => {
    const { user } = setup()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog')).toHaveTextContent('Casi llegás')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog')).toHaveTextContent('Este mes te faltan')
  })

  it('the action goes to its screen and closes the viewer', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('link', { name: 'Ver mi meta' }))
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText('detalle de meta')).toBeInTheDocument()
  })

  it('can be paused and resumed', async () => {
    const { user } = setup()
    const pause = screen.getByRole('button', { name: 'Pausar' })
    expect(pause).toHaveAttribute('aria-pressed', 'false')
    await user.click(pause)
    expect(screen.getByRole('button', { name: 'Reanudar' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('advances by itself with time to read, and stops while paused', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    try {
      setup([
        story('uno', [
          { title: 'Uno', body: 'a' },
          { title: 'Dos', body: 'b' },
        ]),
      ])
      const dialog = screen.getByRole('dialog')
      act(() => void vi.advanceTimersByTime(5000))
      expect(dialog).toHaveTextContent('Uno')
      act(() => void vi.advanceTimersByTime(3000))
      expect(dialog).toHaveTextContent('Dos')
      act(() => screen.getByRole('button', { name: 'Pausar' }).click())
      act(() => void vi.advanceTimersByTime(60_000))
      expect(dialog).toHaveTextContent('Dos')
    } finally {
      vi.useRealTimers()
    }
  })

  it('with reduced motion it never moves by itself and has nothing to pause', () => {
    reduced = true
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    try {
      setup([
        story('uno', [
          { title: 'Uno', body: 'a' },
          { title: 'Dos', body: 'b' },
        ]),
      ])
      act(() => void vi.advanceTimersByTime(60_000))
      expect(screen.getByRole('dialog')).toHaveTextContent('Uno')
      expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a slide that hosts actions keeps its content and never advances on its own', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    try {
      setup([
        story('ahorro', [{ title: 'Tu ahorro', body: 'Elegí', embed: 'savings-notices' }]),
        gastos,
      ])
      expect(screen.getByText('avisos de ahorro')).toBeInTheDocument()
      act(() => void vi.advanceTimersByTime(60_000))
      expect(screen.getByRole('dialog', { name: 'Historia: AHORRO' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hosts the recurring reminders as they are', () => {
    setup([story('recordatorios', [{ title: 'Pagos', body: 'x', embed: 'recurring-reminders' }])])
    expect(screen.getByText('pagos próximos')).toBeInTheDocument()
  })

  describe('Menta viewer', () => {
    const withTip = story('limites', [
      {
        title: 'Cerca de un límite',
        figure: '$3.000',
        body: 'Llevás el 80%.',
        tip: 'Mirá cuánto te queda antes de comprar.',
      },
      { title: 'Sin consejo', body: 'Solo lo que pasó.' },
    ])

    it('maps body to "Qué pasó" and shows the tip as "Qué podés mejorar"', () => {
      setup([withTip])
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Qué pasó')
      expect(dialog).toHaveTextContent('Llevás el 80%.')
      expect(dialog).toHaveTextContent('Qué podés mejorar')
      expect(dialog).toHaveTextContent('Mirá cuánto te queda antes de comprar.')
    })

    it('a slide without tip does not show the "Qué podés mejorar" card', async () => {
      const { user } = setup([withTip])
      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Solo lo que pasó.')
      expect(screen.queryByText('Qué podés mejorar')).toBeNull()
    })

    it('shows the cat with "Moni", the kicker and a previous / next row', () => {
      setup([metas])
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Moni')
      expect(dialog).toHaveTextContent('METAS')
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
    })

    it('the last "Siguiente" closes the viewer', async () => {
      const { user, onClose } = setup([gastos])
      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('auto-advances after about 6 seconds of reading with fake timers, and a hold pauses it', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
      try {
        setup([
          story('uno', [
            { title: 'Uno', body: 'a' },
            { title: 'Dos', body: 'b' },
          ]),
        ])
        const dialog = screen.getByRole('dialog')
        const area = screen.getByTestId('story-tap-next')
        act(() => void fireEvent.pointerDown(area))
        act(() => void vi.advanceTimersByTime(30_000))
        expect(dialog).toHaveTextContent('Uno')
        act(() => void fireEvent.pointerUp(area))
        act(() => void vi.advanceTimersByTime(7_500))
        expect(dialog).toHaveTextContent('Dos')
      } finally {
        vi.useRealTimers()
      }
    })

    it('tapping the left and right areas navigates', () => {
      setup()
      const dialog = screen.getByRole('dialog')
      fireEvent.pointerDown(screen.getByTestId('story-tap-next'))
      fireEvent.pointerUp(screen.getByTestId('story-tap-next'))
      expect(dialog).toHaveTextContent('Casi llegás')
      fireEvent.pointerDown(screen.getByTestId('story-tap-prev'))
      fireEvent.pointerUp(screen.getByTestId('story-tap-prev'))
      expect(dialog).toHaveTextContent('Este mes te faltan')
    })

    it('swiping down closes it, and a short drag does not', () => {
      const { onClose } = setup()
      const area = screen.getByTestId('story-tap-next')
      fireEvent.pointerDown(area, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(area, { clientX: 105, clientY: 140 })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.pointerDown(area, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(area, { clientX: 110, clientY: 260 })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('traps the focus inside the dialog', async () => {
      const { user } = setup()
      const dialog = screen.getByRole('dialog')
      for (let i = 0; i < 12; i++) {
        await user.tab()
        expect(dialog.contains(document.activeElement)).toBe(true)
      }
    })
  })
})
