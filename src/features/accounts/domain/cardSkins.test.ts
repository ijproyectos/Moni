import { BANK_CATALOG, QUICK_ADD_BRANDS } from './bankCatalog'
import {
  CARD_SKINS,
  contrastRatio,
  skinBackground,
  skinContrast,
  skinForAccountName,
  skinForBrandId,
} from './cardSkins'

describe('QUICK_ADD_BRANDS', () => {
  it('offers every bank and wallet, and no credit card', () => {
    expect(QUICK_ADD_BRANDS.map((b) => b.name)).toEqual([
      'Ualá',
      'Cuenta DNI',
      'Brubank',
      'Lemon',
      'Naranja X',
      'BBVA',
      'Banco Nación',
      'Macro',
      'ICBC',
      'HSBC',
      'Banco Provincia',
      'Mercado Pago',
      'Galicia',
      'Santander',
    ])
    expect(QUICK_ADD_BRANDS.every((b) => b.kind !== 'credit_card')).toBe(true)
  })

  it('keeps Visa, Mastercard and Amex in the catalog so the cards that already exist keep their look', () => {
    for (const name of ['Visa', 'Mastercard', 'Amex']) {
      expect(BANK_CATALOG.find((b) => b.name === name)?.quickAdd).toBe(false)
    }
  })
})

describe('card skins', () => {
  it('every brand of the catalog has its own identity, and each one is different', () => {
    expect(CARD_SKINS.map((s) => s.id).sort()).toEqual(BANK_CATALOG.map((b) => b.id).sort())
    const backgrounds = CARD_SKINS.map((s) => skinBackground(s))
    expect(new Set(backgrounds).size).toBe(CARD_SKINS.length)
  })

  it.each(CARD_SKINS.map((s) => [s.id, s] as const))(
    '%s: the text is readable on the card (contrast at least 4.5:1)',
    (_id, skin) => {
      expect(skinContrast(skin)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('finds the skin of a bank or wallet by its name (accents and case do not matter)', () => {
    expect(skinForAccountName('Galicia')?.id).toBe('galicia')
    expect(skinForAccountName('  ualá ')?.id).toBe('uala')
    expect(skinForAccountName('Mercado Pago')?.id).toBe('mercado-pago')
    expect(skinForBrandId('bbva')?.art).toBe('waves')
  })

  it("cash and custom media have none: they keep Moni's own colors", () => {
    expect(skinForAccountName('Efectivo')).toBeUndefined()
    expect(skinForAccountName('Galicia sueldo')).toBeUndefined()
    expect(skinForAccountName('Mi cuenta')).toBeUndefined()
  })

  it('contrast is symmetrical and white on black is the maximum', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
  })

  it('never carries card numbers, expiry dates or bank data', () => {
    const text = JSON.stringify(CARD_SKINS)
    expect(text).not.toMatch(/\d{4}\s?\d{4}|\d{2}\/\d{2}|cbu|cvu/i)
  })
})
