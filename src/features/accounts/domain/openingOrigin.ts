import type { Category } from '@/features/categories/domain/category'
import { isIsoDate, type IsoDate } from '@/shared/lib/month'

/** Where the starting money of an account comes from ("¿De dónde viene esta plata?"). */
export type OpeningSource = 'previous' | 'salary' | 'other'

export interface OpeningOrigin {
  source: OpeningSource
  /** Income category; only used by "salary" and "other". */
  categoryId: string | null
  /** Day the income was received; only used by "salary" and "other". */
  occurredOn: IsoDate
}

export const OPENING_SOURCE_OPTIONS: readonly {
  value: OpeningSource
  label: string
  hint: string
}[] = [
  { value: 'previous', label: 'Dinero que ya tenía', hint: 'Ahorros o saldo anterior' },
  { value: 'salary', label: 'Mi sueldo', hint: 'Plata que cobré trabajando' },
  { value: 'other', label: 'Otro ingreso', hint: 'Regalo, venta, trabajo extra u otra fuente' },
]

/** "Dinero que ya tenía" is the default: it never touches the income of the month. */
export function defaultOpeningOrigin(today: IsoDate): OpeningOrigin {
  return { source: 'previous', categoryId: null, occurredOn: today }
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** The person's "Sueldo" income category, if they still have it. */
export function findSalaryCategory(categories: readonly Category[]): Category | undefined {
  return categories.find(
    (c) => c.kind === 'income' && c.archivedAt === null && normalize(c.name) === 'sueldo',
  )
}

/** Changing the source keeps the date; "salary" preselects the Sueldo category, "previous" drops the category. */
export function withSource(
  origin: OpeningOrigin,
  source: OpeningSource,
  categories: readonly Category[],
): OpeningOrigin {
  if (source === 'previous') return { ...origin, source, categoryId: null }
  if (source === 'salary') {
    return { ...origin, source, categoryId: findSalaryCategory(categories)?.id ?? null }
  }
  // Moving from "salary" to "other" starts without a category so the person chooses one on purpose.
  return { ...origin, source, categoryId: origin.source === 'other' ? origin.categoryId : null }
}

/** What is missing to save the origin, in the person's words; null when it is complete. */
export function originProblem(origin: OpeningOrigin): string | null {
  if (origin.source === 'previous') return null
  if (origin.categoryId === null) return 'Elegí una categoría para el ingreso.'
  if (!isIsoDate(origin.occurredOn)) return 'Elegí una fecha válida.'
  return null
}

/** The shape the database functions take. */
export function toOpeningRequest(origin: OpeningOrigin): {
  source: 'previous' | 'income'
  categoryId: string | null
  occurredOn: IsoDate | null
} {
  return origin.source === 'previous'
    ? { source: 'previous', categoryId: null, occurredOn: null }
    : { source: 'income', categoryId: origin.categoryId, occurredOn: origin.occurredOn }
}
