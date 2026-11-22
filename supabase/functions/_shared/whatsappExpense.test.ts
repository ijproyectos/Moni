import {
  formatConfirmationReply,
  formatPesos,
  isUndoCommand,
  pickFallbackCategoryId,
  type ConfirmedMovement,
} from './whatsappExpense.ts'
import type { CategoryRef, ParsedMovement } from '../parse-movements/lib.ts'

describe('isUndoCommand', () => {
  it('matches "deshacer"/"borrar" case- and whitespace-insensitively, nothing else', () => {
    expect(isUndoCommand('deshacer')).toBe(true)
    expect(isUndoCommand('  Deshacer  ')).toBe(true)
    expect(isUndoCommand('BORRAR')).toBe(true)
    expect(isUndoCommand('deshacer el gasto')).toBe(false)
    expect(isUndoCommand('')).toBe(false)
  })
})

describe('formatPesos', () => {
  it('formats whole and fractional pesos the Argentine way', () => {
    expect(formatPesos(1_234_50)).toBe('$1.234,50')
    expect(formatPesos(1_500_00)).toBe('$1.500')
    expect(formatPesos(50)).toBe('$0,50')
  })
})

describe('pickFallbackCategoryId', () => {
  const categories: CategoryRef[] = [
    { id: 'sueldo', name: 'Sueldo', kind: 'income' },
    { id: 'comida', name: 'Comida', kind: 'expense' },
    { id: 'otros-expense', name: 'Otros', kind: 'expense' },
    { id: 'otros-income', name: 'otros', kind: 'income' }, // case-insensitive match on purpose
  ]

  it('prefers "otros" among categories of the requested kind', () => {
    expect(pickFallbackCategoryId(categories, 'expense')).toBe('otros-expense')
    expect(pickFallbackCategoryId(categories, 'income')).toBe('otros-income')
  })

  it('falls back to the first (oldest) category of that kind when there is no "otros"', () => {
    const noOtros: CategoryRef[] = [
      { id: 'first', name: 'Super', kind: 'expense' },
      { id: 'second', name: 'Transporte', kind: 'expense' },
    ]
    expect(pickFallbackCategoryId(noOtros, 'expense')).toBe('first')
  })

  it('returns null when there is no category of that kind at all', () => {
    expect(pickFallbackCategoryId([], 'expense')).toBeNull()
    expect(pickFallbackCategoryId([{ id: 'x', name: 'Sueldo', kind: 'income' }], 'expense')).toBeNull()
  })
})

describe('formatConfirmationReply', () => {
  function movement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
    return {
      kind: 'expense',
      amountCents: 1_500_00,
      note: null,
      categoryId: 'comida',
      accountId: 'cuenta-1',
      occurredOn: '2026-11-21',
      confidence: 0.9,
      ...overrides,
    }
  }

  it('confirms a single expense with its category and an undo hint', () => {
    const items: ConfirmedMovement[] = [{ movement: movement(), categoryName: 'Comida' }]
    expect(formatConfirmationReply(items)).toBe(
      'Cargué $1.500 en Comida 🐱.\nSi me equivoqué, respondé "deshacer".',
    )
  })

  it('includes the note and handles income wording', () => {
    const items: ConfirmedMovement[] = [
      { movement: movement({ note: 'nafta' }), categoryName: 'Auto' },
      { movement: movement({ kind: 'income', amountCents: 50_000_00, note: null }), categoryName: 'Sueldo' },
    ]
    const text = formatConfirmationReply(items)
    expect(text).toContain('Cargué $1.500 en Auto (nafta) 🐱.')
    expect(text).toContain('Cargué un ingreso de $50.000 🐱.')
  })
})
