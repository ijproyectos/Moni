import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { RecentMovement } from '../domain/monthSummary'
import { RecentMovements, type MovementActions } from './RecentMovements'

const movement = (over: Partial<RecentMovement> = {}): RecentMovement => ({
  id: 'm1',
  kind: 'expense',
  amountCents: 40_000_00,
  occurredOn: '2026-11-01',
  note: 'ChatGPT',
  accountId: 'a',
  accountName: 'Mercado Pago',
  categoryName: 'Suscripciones',
  categoryColor: null,
  categoryIcon: null,
  ...over,
})

function setup(
  movements: RecentMovement[],
  actions?: Partial<MovementActions>,
  total?: number,
  today = '2026-11-05',
) {
  const full: MovementActions = {
    canEdit: () => true,
    canVoid: () => true,
    isInstallment: () => false,
    onEdit: vi.fn(),
    onVoid: vi.fn().mockResolvedValue(undefined),
    ...actions,
  }
  render(
    <MemoryRouter>
      <RecentMovements movements={movements} total={total} actions={full} today={today} />
    </MemoryRouter>,
  )
  return { full, user: userEvent.setup() }
}

describe('RecentMovements', () => {
  it('lists plain rows by day: concept, category and payment method, amount on the right', () => {
    setup(
      [
        movement(),
        movement({
          id: 'm2',
          note: 'Belleza',
          categoryName: 'Belleza',
          accountName: 'Efectivo',
          amountCents: 40_000_00,
        }),
        movement({
          id: 'm3',
          kind: 'income',
          note: 'Sueldo',
          categoryName: 'Sueldo',
          occurredOn: '2026-10-31',
          amountCents: 1_000_00,
        }),
      ],
      undefined,
      25,
    )
    const day = screen.getByRole('region', { name: 'Domingo, 1 de noviembre' })
    expect(day).toHaveTextContent('1 de noviembre')
    expect(day).toHaveTextContent('-$40.000')
    expect(day).toHaveTextContent('ChatGPT')
    expect(day).toHaveTextContent('Suscripciones · Mercado Pago')
    expect(screen.getByRole('region', { name: 'Sábado, 31 de octubre' })).toHaveTextContent(
      '+$1.000',
    )
    // One heading per day: the date is not repeated on each movement.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Ver los 25' })).toHaveAttribute('href', '/actividad')
  })

  it('without a total the link says "Ver todos"', () => {
    setup([movement()])
    expect(screen.getByRole('link', { name: 'Ver todos' })).toBeInTheDocument()
  })

  it('opening balance and adjustments have no category: they say what they are', () => {
    setup([
      movement({
        id: 'o',
        kind: 'opening_in',
        note: null,
        categoryName: null,
        amountCents: 300_000_00,
      }),
    ])
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument()
  })

  it('tapping an editable row edits it', async () => {
    const { user, full } = setup([movement()])
    await user.click(screen.getByRole('button', { name: 'Editar ChatGPT' }))
    expect(full.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('has the hint and the swipe actions behind each row, reachable without a gesture', async () => {
    const { user, full } = setup([movement()])
    expect(screen.getByText(/Deslizá un movimiento a la izquierda/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(full.onEdit).toHaveBeenCalledTimes(1)
  })

  it('voiding asks first and then voids; cancelling keeps the movement', async () => {
    const { user, full } = setup([movement()])
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    const dialog = screen.getByRole('dialog', { name: '¿Anular este movimiento?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(full.onVoid).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '¿Anular este movimiento?' })).getByRole('button', {
        name: 'Anular',
      }),
    )
    expect(full.onVoid).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('an installment warns that the whole purchase is voided', async () => {
    const { user } = setup([movement()], { isInstallment: () => true, canEdit: () => false })
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    expect(screen.getByRole('dialog', { name: '¿Anular la compra en cuotas?' })).toHaveTextContent(
      'Se anulan todas las cuotas',
    )
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('shows the reason when voiding fails', async () => {
    const { user } = setup([movement()], {
      onVoid: vi.fn().mockRejectedValue(new Error('Sin conexión')),
    })
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Anular' }))
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  })

  it('rows that cannot be edited or voided are plain and there is no hint', () => {
    setup([movement()], { canEdit: () => false, canVoid: () => false })
    expect(screen.queryByText(/Deslizá/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull()
  })
})

describe('RecentMovements: groups by day and expands', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      movement({
        id: `m${i}`,
        note: `Compra ${i}`,
        occurredOn: i < 2 ? '2026-11-05' : '2026-11-04',
      }),
    )

  it('heads each day once, with Hoy and Ayer in words and the date of the others', () => {
    setup([
      movement({ id: 'a', occurredOn: '2026-11-05' }),
      movement({ id: 'b', occurredOn: '2026-11-04' }),
      movement({ id: 'c', occurredOn: '2026-11-01' }),
      movement({ id: 'd', occurredOn: '2026-11-01', note: 'Belleza' }),
    ])
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Hoy, 5 de noviembre', 'Ayer, 4 de noviembre', '1 de noviembre'])
  })

  it('shows the last 5 first, then all of them with Ver más movimientos and back with Ver menos', async () => {
    const { user } = setup(many(8))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Ver más movimientos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('has no expand button when 5 or fewer movements fit', () => {
    setup(many(5))
    expect(screen.queryByRole('button', { name: /Ver más movimientos/ })).toBeNull()
  })

  it('keeps the link to the full Movimientos screen', () => {
    setup(many(8), undefined, 40)
    expect(screen.getByRole('link', { name: 'Ver los 40' })).toHaveAttribute('href', '/actividad')
  })
})
