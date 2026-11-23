import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('tapping a row opens the read-only detail first; Editar and Eliminar live there', async () => {
    const onEdit = vi.fn()
    const { user, full } = setup([movement()], {
      canOpen: () => true,
      renderDetail: (m, api) => (
        <div role="dialog" aria-label="detalle">
          {m.note}
          <button onClick={onEdit}>Editar</button>
          <button onClick={api.onDelete}>Eliminar</button>
          <button onClick={api.onClose}>Cerrar</button>
        </div>
      ),
    })
    await user.click(screen.getByText('ChatGPT'))
    expect(full.onEdit).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'detalle' })).toHaveTextContent('ChatGPT')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByRole('dialog', { name: 'detalle' })).toBeNull()
    expect(screen.getByText('¿Eliminar este movimiento?')).toBeInTheDocument()
    expect(full.onVoid).not.toHaveBeenCalled()
  })

  it('has the hint and the swipe actions behind each row, reachable without a gesture', async () => {
    const { user, full } = setup([movement()])
    expect(
      screen.getByText(
        /Deslizá un movimiento a la derecha para editarlo o a la izquierda para eliminarlo/,
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar ChatGPT' }))
    expect(full.onEdit).toHaveBeenCalledTimes(1)
  })

  it('voiding asks first and then voids; cancelling keeps the movement', async () => {
    const { user, full } = setup([movement()])
    await user.click(screen.getByRole('button', { name: 'Eliminar ChatGPT' }))
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar este movimiento?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(full.onVoid).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Eliminar ChatGPT' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '¿Eliminar este movimiento?' })).getByRole('button', {
        name: 'Eliminar',
      }),
    )
    expect(full.onVoid).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('swiping right reveals Eliminar and swiping left reveals Editar, like Actividad', () => {
    setup([movement()])
    const row = screen.getByText('ChatGPT').closest('button')?.parentElement as HTMLElement
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(row, { clientX: from, clientY: 10, pointerId: 1 })
      fireEvent.pointerMove(row, { clientX: to, clientY: 10, pointerId: 1 })
      fireEvent.pointerUp(row, { clientX: to, clientY: 10, pointerId: 1 })
    }
    swipe(100, 190)
    expect(row.style.transform).toBe('translateX(76px)')
    swipe(190, 100)
    swipe(200, 100)
    expect(row.style.transform).toBe('translateX(-76px)')
  })

  it('an installment warns that the whole purchase is voided', async () => {
    const { user } = setup([movement()], { isInstallment: () => true, canEdit: () => false })
    await user.click(screen.getByRole('button', { name: 'Eliminar ChatGPT' }))
    expect(screen.getByRole('dialog', { name: '¿Eliminar la compra en cuotas?' })).toHaveTextContent(
      'Se anulan todas las cuotas',
    )
    expect(screen.queryByRole('button', { name: 'Editar ChatGPT' })).toBeNull()
  })

  it('shows the reason when voiding fails', async () => {
    const { user } = setup([movement()], {
      onVoid: vi.fn().mockRejectedValue(new Error('Sin conexión')),
    })
    await user.click(screen.getByRole('button', { name: 'Eliminar ChatGPT' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  })

  it('rows that cannot be edited or voided are plain and there is no hint', () => {
    setup([movement()], { canEdit: () => false, canVoid: () => false })
    expect(screen.queryByText(/Deslizá/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).toBeNull()
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

  it('the "latest" variant groups by day, each date once, newest first', () => {
    render(
      <MemoryRouter>
        <RecentMovements
          variant="latest"
          today="2026-11-18"
          movements={[
            movement({ id: 'a', note: 'Café', occurredOn: '2026-11-18' }),
            movement({ id: 'b', note: 'Súper', occurredOn: '2026-11-18' }),
            movement({ id: 'c', note: 'Nafta', occurredOn: '2026-11-17' }),
            movement({ id: 'd', note: 'Cena', occurredOn: '2026-11-16' }),
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Movimientos' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Hoy',
      'Ayer',
      'Lunes 16 de noviembre',
    ])
    const today = screen.getByRole('region', { name: 'Hoy' })
    expect(within(today).getByText('Café')).toBeInTheDocument()
    expect(within(today).getByText('Súper')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/actividad')
  })

  it('tells group movements apart: the kind, the group and the account used', () => {
    render(
      <MemoryRouter>
        <RecentMovements
          variant="latest"
          today="2026-11-05"
          movements={[
            movement({ id: 'g1', kind: 'shared_payment', note: 'Cena', categoryName: null, groupName: 'IJ' }),
            movement({ id: 'g2', kind: 'settlement_in', note: null, categoryName: null, groupName: 'IJ' }),
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Gasto grupal · IJ · Mercado Pago/)).toBeInTheDocument()
    expect(screen.getByText(/Cobro de deuda · IJ · Mercado Pago/)).toBeInTheDocument()
  })

  it('lists the 9 newest movements of any date, completing today with earlier days', () => {
    const all = Array.from({ length: 12 }, (_, n) =>
      movement({
        id: `m${n}`,
        note: `Mov ${n}`,
        occurredOn: n < 2 ? '2026-11-05' : `2026-10-${String(30 - n).padStart(2, '0')}`,
      }),
    )
    render(
      <MemoryRouter>
        <RecentMovements variant="latest" today="2026-11-05" movements={all} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText(/^Mov \d+$/).map((e) => e.textContent)).toEqual(
      Array.from({ length: 9 }, (_, n) => `Mov ${n}`),
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Hoy' })).toBeInTheDocument()
  })

  it('shows only what exists when there are fewer than 9', () => {
    render(
      <MemoryRouter>
        <RecentMovements variant="latest" today="2026-11-05" movements={[movement({ id: 'only', note: 'Único' })]} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Único')).toHaveLength(1)
  })

  it('Inicio ("latest"): a tap opens the summary, never the edit form, even though the row can be swiped', async () => {
    const onEdit = vi.fn()
    const actions: MovementActions = {
      canEdit: () => true,
      canVoid: () => true,
      isInstallment: () => false,
      onEdit,
      onVoid: vi.fn().mockResolvedValue(undefined),
      canOpen: () => true,
      renderDetail: (m, api) => (
        <div role="dialog" aria-label="resumen">
          {m.note}
          <button onClick={api.onClose}>Cerrar</button>
        </div>
      ),
    }
    render(
      <MemoryRouter>
        <RecentMovements variant="latest" today="2026-11-05" movements={[movement({ note: 'Mesa 12' })]} actions={actions} />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByText('Mesa 12'))
    expect(screen.getByRole('dialog', { name: 'resumen' })).toHaveTextContent('Mesa 12')
    expect(onEdit).not.toHaveBeenCalled()
    // The swipe actions are real buttons too.
    expect(screen.getByRole('button', { name: 'Editar Mesa 12' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar Mesa 12' })).toBeInTheDocument()
  })
})
