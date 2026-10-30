import { logoUrl } from '@/features/subscriptions/domain/logos'
import { ACCOUNT_KINDS } from './account'
import { BANK_CATALOG, brandForAccountName, findBrand, normalizeBrandName } from './bankCatalog'

const kindOf = (name: string) => BANK_CATALOG.find((b) => b.name === name)?.kind

describe('BANK_CATALOG', () => {
  it('lists the quick-add brands in the owner order', () => {
    expect(BANK_CATALOG.map((b) => b.name)).toEqual([
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
      'Visa',
      'Mastercard',
      'Amex',
      'Mercado Pago',
      'Galicia',
      'Santander',
    ])
  })

  it('maps wallets, banks and cards to the existing account kinds', () => {
    for (const name of ['Ualá', 'Cuenta DNI', 'Brubank', 'Lemon', 'Naranja X', 'Mercado Pago']) {
      expect(kindOf(name)).toBe('wallet')
    }
    for (const name of [
      'BBVA',
      'Banco Nación',
      'Macro',
      'ICBC',
      'HSBC',
      'Banco Provincia',
      'Galicia',
      'Santander',
    ]) {
      expect(kindOf(name)).toBe('bank')
    }
    for (const name of ['Visa', 'Mastercard', 'Amex']) expect(kindOf(name)).toBe('credit_card')
    expect(BANK_CATALOG.every((b) => ACCOUNT_KINDS.includes(b.kind))).toBe(true)
  })

  it('has unique ids, valid brand colors and initials for every entry', () => {
    expect(new Set(BANK_CATALOG.map((b) => b.id)).size).toBe(BANK_CATALOG.length)
    for (const b of BANK_CATALOG) {
      expect(b.brandColor).toMatch(/^#[0-9A-F]{6}$/i)
      expect(b.initials.length).toBeGreaterThan(0)
      expect(b.initials.length).toBeLessThanOrEqual(3)
    }
  })

  it('only declares logos whose file is saved locally; the rest are pending', () => {
    const withLogo = BANK_CATALOG.filter((b) => b.logo).map((b) => b.id)
    expect(withLogo.sort()).toEqual(['amex', 'hsbc', 'mastercard', 'mercado-pago', 'visa'])
    for (const b of BANK_CATALOG) {
      if (b.logo) expect(logoUrl(b.logo)).toBeTruthy()
    }
  })
})

describe('brandForAccountName', () => {
  it('matches the exact name ignoring case, accents and extra spaces', () => {
    expect(brandForAccountName('Galicia')?.id).toBe('galicia')
    expect(brandForAccountName('  uala ')?.id).toBe('uala')
    expect(brandForAccountName('BANCO  NACION')?.id).toBe('banco-nacion')
    expect(brandForAccountName('mercado pago')?.id).toBe('mercado-pago')
  })

  it('does not guess from partial names', () => {
    expect(brandForAccountName('Galicia sueldo')).toBeUndefined()
    expect(brandForAccountName('Efectivo')).toBeUndefined()
    expect(brandForAccountName('')).toBeUndefined()
  })

  it('normalizes and finds by id', () => {
    expect(normalizeBrandName(' Ualá ')).toBe('uala')
    expect(findBrand('visa')?.name).toBe('Visa')
    expect(findBrand('nope')).toBeUndefined()
  })
})
