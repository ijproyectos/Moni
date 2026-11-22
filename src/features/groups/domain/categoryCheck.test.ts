import { categorySeemsWrong } from './categoryCheck'

describe('categorySeemsWrong', () => {
  it('flags "Remera" saved as Comida, without touching anything', () => {
    expect(categorySeemsWrong('Remera', 'comida')).toBe(true)
    expect(categorySeemsWrong('Remeras de River', 'comida')).toBe(true)
  })
  it('does not flag fitting, missing or unknown categories', () => {
    expect(categorySeemsWrong('Remera', null)).toBe(false)
    expect(categorySeemsWrong('Remera', 'otros')).toBe(false)
    expect(categorySeemsWrong('Pizza', 'comida')).toBe(false)
    expect(categorySeemsWrong('Algo raro', 'comida')).toBe(false)
  })
})

describe('Ropa', () => {
  it('fits a clothing expense and flags a food category', () => {
    expect(categorySeemsWrong('Remera', 'ropa')).toBe(false)
    expect(categorySeemsWrong('Remera', 'comida')).toBe(true)
  })
})
