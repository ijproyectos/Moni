import { buildMovementRows, parseMovementRows, type MovementRowLookups } from './movementsWorkbook'

const lookups: MovementRowLookups = {
  categoryIdByKindAndName: new Map([
    ['expense::comida', 'cat-comida'],
    ['income::sueldo', 'cat-sueldo'],
  ]),
  accountIdByName: new Map([['efectivo', 'acc-efectivo']]),
  defaultAccountId: 'acc-default',
}

describe('buildMovementRows', () => {
  it('resuelve nombres de categoría y cuenta, y pasa el monto en unidades normales', () => {
    const rows = buildMovementRows(
      [
        {
          kind: 'expense',
          amountCents: 123450,
          occurredOn: '2026-11-01',
          categoryId: 'cat-comida',
          accountId: 'acc-efectivo',
          note: 'Super',
        },
      ],
      new Map([['cat-comida', 'Comida']]),
      new Map([['acc-efectivo', 'Efectivo']]),
    )
    expect(rows[0]).toEqual(['Fecha', 'Tipo', 'Monto', 'Categoría', 'Cuenta', 'Nota'])
    expect(rows[1]).toEqual(['2026-11-01', 'Gasto', 1234.5, 'Comida', 'Efectivo', 'Super'])
  })
})

describe('parseMovementRows', () => {
  it('acepta una fila válida de gasto', () => {
    const result = parseMovementRows(
      [['2026-11-01', 'Gasto', 1500, 'Comida', 'Efectivo', 'Almuerzo']],
      lookups,
    )
    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        kind: 'expense',
        amountCents: 150000,
        occurredOn: '2026-11-01',
        categoryId: 'cat-comida',
        accountId: 'acc-efectivo',
        note: 'Almuerzo',
      },
    ])
  })

  it('acepta una fila de ingreso sin cuenta, usando la cuenta por defecto', () => {
    const result = parseMovementRows([['2026-11-02', 'Ingreso', 50000, 'Sueldo', '', '']], lookups)
    expect(result.issues).toEqual([])
    expect(result.rows[0]?.accountId).toBe('acc-default')
    expect(result.rows[0]?.note).toBeNull()
  })

  it('ignora filas completamente vacías', () => {
    const result = parseMovementRows([[null, null, null, null, null, null]], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('rechaza un tipo que no sea Gasto o Ingreso', () => {
    const result = parseMovementRows([['2026-11-01', 'Transferencia', 100, 'Comida', '', '']], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues).toEqual([{ rowNumber: 2, reason: expect.stringContaining('Transferencia') }])
  })

  it('rechaza una fecha inválida', () => {
    const result = parseMovementRows([['no es una fecha', 'Gasto', 100, 'Comida', '', '']], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues[0]?.reason).toContain('fecha')
  })

  it('rechaza un monto no numérico', () => {
    const result = parseMovementRows([['2026-11-01', 'Gasto', 'mil pesos', 'Comida', '', '']], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues[0]?.reason).toContain('monto')
  })

  it('rechaza una categoría que no existe (el check de la base exige categoría en gasto/ingreso)', () => {
    const result = parseMovementRows([['2026-11-01', 'Gasto', 100, 'Categoría inventada', '', '']], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues[0]?.reason).toContain('Categoría inventada')
  })

  it('rechaza una cuenta que no existe por nombre', () => {
    const result = parseMovementRows([['2026-11-01', 'Gasto', 100, 'Comida', 'Banco Fantasma', '']], lookups)
    expect(result.rows).toEqual([])
    expect(result.issues[0]?.reason).toContain('Banco Fantasma')
  })

  it('acepta fecha en formato dd/mm/yyyy', () => {
    const result = parseMovementRows([['05/11/2026', 'Gasto', 100, 'Comida', '', '']], lookups)
    expect(result.rows[0]?.occurredOn).toBe('2026-11-05')
  })

  it('acepta una fecha como objeto Date (lo que entrega ExcelJS en celdas con formato fecha)', () => {
    const result = parseMovementRows([[new Date('2026-11-10T00:00:00.000Z'), 'Gasto', 100, 'Comida', '', '']], lookups)
    expect(result.rows[0]?.occurredOn).toBe('2026-11-10')
  })
})
