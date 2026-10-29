import type { Category } from '@/features/categories/domain/category'
import {
  defaultOpeningOrigin,
  findSalaryCategory,
  originProblem,
  toOpeningRequest,
  withSource,
} from './openingOrigin'

const cat = (id: string, name: string, over: Partial<Category> = {}): Category => ({
  id,
  name,
  kind: 'income',
  icon: 'Wallet',
  color: '#0E8A6D',
  archivedAt: null,
  ...over,
})
const SUELDO = cat('c1', 'Sueldo')
const GIFT = cat('c2', 'Regalos')

describe('opening origin', () => {
  it('defaults to money the person already had', () => {
    expect(defaultOpeningOrigin('2026-10-29')).toEqual({
      source: 'previous',
      categoryId: null,
      occurredOn: '2026-10-29',
    })
  })

  it('finds the Sueldo category regardless of case and accents, ignoring archived or expense ones', () => {
    expect(findSalaryCategory([GIFT, cat('x', ' SUELDO ')])?.id).toBe('x')
    expect(findSalaryCategory([cat('a', 'Sueldo', { archivedAt: '2026-01-01' })])).toBeUndefined()
    expect(findSalaryCategory([cat('e', 'Sueldo', { kind: 'expense' })])).toBeUndefined()
  })

  it('"Mi sueldo" preselects Sueldo; "Dinero que ya tenía" drops any category; the date is kept', () => {
    const start = defaultOpeningOrigin('2026-10-05')
    const salary = withSource(start, 'salary', [GIFT, SUELDO])
    expect(salary).toMatchObject({ source: 'salary', categoryId: 'c1', occurredOn: '2026-10-05' })
    expect(withSource(salary, 'previous', [SUELDO])).toMatchObject({
      source: 'previous',
      categoryId: null,
    })
  })

  it('"Otro ingreso" starts without a category so the person chooses on purpose', () => {
    const salary = withSource(defaultOpeningOrigin('2026-10-05'), 'salary', [SUELDO])
    expect(withSource(salary, 'other', [SUELDO, GIFT]).categoryId).toBeNull()
  })

  it('an income needs a category and a real date; previous money needs nothing', () => {
    const base = defaultOpeningOrigin('2026-10-05')
    expect(originProblem(base)).toBeNull()
    expect(originProblem({ ...base, source: 'other', categoryId: null })).toMatch(/categoría/)
    expect(originProblem({ ...base, source: 'salary', categoryId: 'c1', occurredOn: '' })).toMatch(
      /fecha/,
    )
    expect(originProblem({ ...base, source: 'salary', categoryId: 'c1' })).toBeNull()
  })

  it('maps to the database request: salary and other are both "income"', () => {
    const base = defaultOpeningOrigin('2026-10-05')
    expect(toOpeningRequest(base)).toEqual({
      source: 'previous',
      categoryId: null,
      occurredOn: null,
    })
    expect(
      toOpeningRequest({ source: 'other', categoryId: 'c2', occurredOn: '2026-10-05' }),
    ).toEqual({
      source: 'income',
      categoryId: 'c2',
      occurredOn: '2026-10-05',
    })
  })
})
