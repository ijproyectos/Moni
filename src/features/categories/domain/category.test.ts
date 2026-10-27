import {
  categoriesByKind,
  categoryFormSchema,
  isCategoryNameTaken,
  type Category,
} from './category'

const category = (overrides: Partial<Category>): Category => ({
  id: 'c1',
  kind: 'expense',
  name: 'Comida',
  icon: 'Utensils',
  color: '#E5533D',
  archivedAt: null,
  ...overrides,
})

describe('isCategoryNameTaken', () => {
  const list = [category({}), category({ id: 'c2', name: 'Viejo', archivedAt: '2026-01-01' })]

  it('compares case-insensitively within the same kind', () => {
    expect(isCategoryNameTaken(list, 'expense', '  comida ')).toBe(true)
    expect(isCategoryNameTaken(list, 'income', 'Comida')).toBe(false)
  })

  it('ignores archived categories and the edited one', () => {
    expect(isCategoryNameTaken(list, 'expense', 'Viejo')).toBe(false)
    expect(isCategoryNameTaken(list, 'expense', 'Comida', 'c1')).toBe(false)
  })
})

describe('categoriesByKind', () => {
  it('keeps only the requested kind', () => {
    const list = [category({}), category({ id: 'c3', kind: 'income', name: 'Sueldo' })]
    expect(categoriesByKind(list, 'income').map((c) => c.name)).toEqual(['Sueldo'])
  })
})

describe('categoryFormSchema', () => {
  it('validates the color format', () => {
    const base = { kind: 'expense', name: 'Gym', icon: 'Heart' }
    expect(categoryFormSchema.safeParse({ ...base, color: '#112233' }).success).toBe(true)
    expect(categoryFormSchema.safeParse({ ...base, color: 'red' }).success).toBe(false)
  })
})
