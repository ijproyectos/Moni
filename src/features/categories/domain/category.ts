import { z } from 'zod'
import type { CategoryKind } from '@/shared/lib/database.types'

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
}

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  /** lucide-react icon name, e.g. "Utensils". */
  icon: string
  color: string
  archivedAt: string | null
}

export interface CategoryTemplate {
  slug: string
  kind: CategoryKind
  name: string
  icon: string
  color: string
  sortOrder: number
}

export const categoryFormSchema = z.object({
  kind: z.enum(['expense', 'income'], { message: 'Elegí gasto o ingreso.' }),
  name: z.string().trim().min(1, 'Ponele un nombre.').max(40, 'Máximo 40 caracteres.'),
  icon: z.string().min(1, 'Elegí un ícono.').max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Elegí un color.'),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

/** Mirrors the database uniqueness rule: one active category per (kind, case-insensitive name). */
export function isCategoryNameTaken(
  categories: readonly Category[],
  kind: CategoryKind,
  name: string,
  exceptId?: string,
): boolean {
  const wanted = name.trim().toLowerCase()
  return categories.some(
    (c) =>
      c.archivedAt === null &&
      c.kind === kind &&
      c.id !== exceptId &&
      c.name.trim().toLowerCase() === wanted,
  )
}

export function categoriesByKind(categories: readonly Category[], kind: CategoryKind): Category[] {
  return categories.filter((c) => c.kind === kind)
}

export function indexCategories(categories: readonly Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}
