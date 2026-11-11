import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

const empty: MonthSummary = {
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: 0,
  byCategory: [],
  daily: [],
  recent: [],
}

const withData: MonthSummary = {
  ...empty,
  expenseCents: 11_950_000,
  incomeCents: 97_000_000,
  balanceCents: 85_050_000,
  availableBalanceCents: 85_050_000,
  byCategory: [
    {
      categoryId: 'a',
      name: 'Súper',
      color: '#064735',
      icon: 'ShoppingCart',
      amountCents: 3_824_000,
      percent: 32,
    },
    {
      categoryId: 'b',
      name: 'Comida',
      color: '#E5533D',
      icon: 'Utensils',
      amountCents: 2_868_000,
      percent: 24,
    },
  ],
}

function renderHome(
  summary: MonthSummary,
  isPlus?: boolean,
  movements?: RecentMovement[],
  extra: Partial<Parameters<typeof HomeScreen>[0]> = {},
) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        movements={movements}
        initial="J"
        onAddMovement={vi.fn()}
        isPlus={isPlus}
        {...extra}
      />
    </MemoryRouter>,
  )
}

const movement = (id: string, occurredOn: string, note: string): RecentMovement => ({
  id,
  kind: 'expense',
  amountCents: 1_000_00,
  occurredOn,
  note,
  accountId: 'a',
  accountName: 'Efectivo',
  categoryName: 'Comida',
  categoryColor: '#E5533D',
  categoryIcon: 'Utensils',
})

const sinDatos = {
  isLoading: false,
  allowance: { kind: 'sin-datos' as const },
  status: null,
  pace: null,
}

describe('HomeScreen (Hoy)', () => {
  it('shows only the newest movement, under "Últimos movimientos"', () => {
    renderHome(empty, false, [
      movement('m1', '2026-10-31', 'Cena'),
      movement('m2', '2026-09-30', 'Almuerzo'),
    ])
    const section = screen.getByRole('heading', { name: 'Últimos movimientos' }).closest('section')
    expect(section).toHaveTextContent('Cena')
    expect(section).toHaveTextContent('Comida · Efectivo')
    expect(screen.queryByText('Almuerzo')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos →' })).toHaveAttribute('href', '/actividad')
  })

  it('without movements it says so honestly', () => {
    renderHome(empty)
    expect(screen.getByRole('heading', { name: 'Últimos movimientos' })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay movimientos/)).toBeInTheDocument()
  })

  it('does not render sections the design does not have: totals, "En qué se fue", Hormigas', () => {
    renderHome(withData, false, [movement('m1', '2026-10-31', 'Cena')], {
      allowance: sinDatos,
      shared: { owedCents: 1_000_00, oweCents: 0 },
    })
    expect(screen.queryByRole('heading', { name: 'En qué se fue' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Gastos por categoría' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Gastos e ingresos del mes' })).toBeNull()
    expect(screen.queryByText('Dinero disponible')).toBeNull()
    expect(screen.queryByRole('link', { name: /Hormigas/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Metas' })).toBeNull()
  })

  it('the PLUS badge on the avatar follows the Plus status it is given', () => {
    renderHome(withData, true)
    expect(screen.getByText('✦ PLUS')).toBeInTheDocument()
  })

  it('there is no PLUS badge on Free', () => {
    renderHome(withData)
    expect(screen.queryByText('✦ PLUS')).not.toBeInTheDocument()
  })

  describe('Tu resumen de hoy only shows what is real', () => {
    it('has no "Tu resumen de hoy" without stories', () => {
      renderHome(empty)
      expect(screen.queryByRole('heading', { name: 'Tu resumen de hoy' })).toBeNull()
    })

    it('shows a bubble per story, in the order it is given, and opens the one tapped', async () => {
      const story = (id: string, label: string, bubble: string) => ({
        id,
        signature: id,
        label,
        bubble,
        tone: 'gold' as const,
        priority: 1,
        slides: [{ title: `Título ${label}`, body: `Cuerpo ${label}` }],
      })
      renderHome(withData, false, undefined, {
        stories: [story('a', 'Cobros', '2'), story('b', 'Metas', '7%')],
      })
      const section = screen.getByRole('heading', { name: 'Tu resumen de hoy' }).closest('section')
      expect(section).toHaveTextContent('2Cobros')
      expect(section).toHaveTextContent('7%Metas')
      await userEvent.setup().click(screen.getByRole('button', { name: /^Metas/ }))
      expect(screen.getByRole('dialog', { name: 'Historia: Metas' })).toHaveTextContent(
        'Cuerpo Metas',
      )
    })
  })

  describe('hero, captura y gastos compartidos', () => {
    it('draws the hero only when the allowance is given', () => {
      renderHome(withData)
      expect(screen.queryByRole('region', { name: 'Hoy podés gastar' })).toBeNull()
      cleanup()
      renderHome(withData, false, undefined, { allowance: sinDatos })
      expect(screen.getByRole('region', { name: 'Hoy podés gastar' })).toBeInTheDocument()
    })

    it('the empty hero sends to load income through onAddIncome', async () => {
      const onAddIncome = vi.fn()
      renderHome(withData, false, undefined, { allowance: sinDatos, onAddIncome })
      await userEvent.setup().click(screen.getByRole('button', { name: 'Cargar ingresos' }))
      expect(onAddIncome).toHaveBeenCalled()
    })

    it('the microphone calls onVoice and the keyboard opens the manual sheet', async () => {
      const onVoice = vi.fn()
      const onAddMovement = vi.fn()
      renderHome(withData, false, undefined, { onVoice, onAddMovement })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Cargar con la voz' }))
      expect(onVoice).toHaveBeenCalledTimes(1)
      await user.click(screen.getByRole('button', { name: 'Cargar a mano' }))
      expect(onAddMovement).toHaveBeenCalledTimes(1)
    })

    it('shows the shared expenses card only with real balances to report', () => {
      renderHome(withData)
      expect(screen.queryByRole('region', { name: 'Gastos compartidos' })).toBeNull()
      cleanup()
      renderHome(withData, false, undefined, { shared: { owedCents: 15_000_00, oweCents: 0 } })
      expect(screen.getByRole('region', { name: 'Gastos compartidos' })).toHaveTextContent(
        '+$15.000',
      )
    })

    it('keeps the order of the design: hero, capture, stories, shared, last movement', () => {
      const story = {
        id: 'a',
        signature: 'a',
        label: 'Cobros',
        bubble: '2',
        tone: 'gold' as const,
        priority: 1,
        slides: [{ title: 't', body: 'b' }],
      }
      renderHome(withData, false, [movement('m1', '2026-10-31', 'Cena')], {
        allowance: sinDatos,
        stories: [story],
        shared: { owedCents: 1_000_00, oweCents: 0 },
      })
      const order = [
        screen.getByRole('region', { name: 'Hoy podés gastar' }),
        screen.getByRole('region', { name: 'Cargar un movimiento' }),
        screen.getByRole('heading', { name: 'Tu resumen de hoy' }),
        screen.getByRole('region', { name: 'Gastos compartidos' }),
        screen.getByRole('heading', { name: 'Últimos movimientos' }),
      ]
      order.slice(1).forEach((el, i) => {
        const before = order.slice(0, -1)[i] as HTMLElement
        expect(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      })
    })
  })
})
