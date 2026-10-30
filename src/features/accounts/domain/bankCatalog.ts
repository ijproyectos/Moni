import type { AccountKind } from '@/shared/lib/database.types'

/** Brand kinds offered in "Agregar rápido"; each one maps to an existing account kind. */
export type BrandKind = Extract<AccountKind, 'bank' | 'wallet' | 'credit_card'>

export interface BankBrand {
  /** Stable identifier. */
  id: string
  /** Name prefilled in the account form (and the one matched against account names). */
  name: string
  kind: BrandKind
  /** Approximate brand color: background of the initials avatar when there is no logo file. */
  brandColor: string
  /** Letters shown in the avatar while the official logo is pending. */
  initials: string
  /**
   * File name (without extension) in src/assets/brands. Absent = logo pending: the UI shows the colored
   * initials avatar. To add one, drop the file in src/assets/brands/ and set its name here (see ATTRIBUTION.md).
   */
  logo?: string
}

const b = (
  id: string,
  name: string,
  kind: BrandKind,
  brandColor: string,
  initials: string,
  logo?: string,
): BankBrand => ({ id, name, kind, brandColor, initials, logo })

/** Order of the chips in "Agregar rápido". Static: nothing here comes from the person or the database. */
export const BANK_CATALOG: readonly BankBrand[] = [
  b('uala', 'Ualá', 'wallet', '#3D3BF3', 'UA'),
  b('cuenta-dni', 'Cuenta DNI', 'wallet', '#00A650', 'DNI'),
  b('brubank', 'Brubank', 'wallet', '#6C2DF2', 'BR'),
  b('lemon', 'Lemon', 'wallet', '#00C853', 'LE'),
  b('naranja-x', 'Naranja X', 'wallet', '#FF6200', 'NX'),
  b('bbva', 'BBVA', 'bank', '#004481', 'BB'),
  b('banco-nacion', 'Banco Nación', 'bank', '#00529B', 'BN'),
  b('macro', 'Macro', 'bank', '#1B3F94', 'MA'),
  b('icbc', 'ICBC', 'bank', '#C4161C', 'IC'),
  b('hsbc', 'HSBC', 'bank', '#DB0011', 'HS', 'hsbc'),
  b('banco-provincia', 'Banco Provincia', 'bank', '#00863D', 'BP'),
  b('visa', 'Visa', 'credit_card', '#1A1F71', 'VI', 'visa'),
  b('mastercard', 'Mastercard', 'credit_card', '#EB001B', 'MC', 'mastercard'),
  b('amex', 'Amex', 'credit_card', '#2E77BC', 'AX', 'americanexpress'),
  b('mercado-pago', 'Mercado Pago', 'wallet', '#00B1EA', 'MP', 'mercadopago'),
  b('galicia', 'Galicia', 'bank', '#F36F21', 'GA'),
  b('santander', 'Santander', 'bank', '#EC0000', 'SA'),
]

/** Lowercase, accent-free, single-spaced: "  Ualá " and "uala" compare equal. */
export function normalizeBrandName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const BY_NAME = new Map(BANK_CATALOG.map((brand) => [normalizeBrandName(brand.name), brand]))

/**
 * Brand of an account, derived by EXACT normalized match of its name to a catalog entry name.
 * Limitation (v1): there is no brand column in the database (no migrations), so renaming an account
 * ("Galicia sueldo") or naming a manual one "Visa" changes what is shown. A later version should persist
 * the catalog id with the account.
 */
export function brandForAccountName(name: string): BankBrand | undefined {
  return BY_NAME.get(normalizeBrandName(name))
}

export function findBrand(id: string): BankBrand | undefined {
  return BANK_CATALOG.find((brand) => brand.id === id)
}
