import type { CategoryKind } from '@/shared/lib/database.types'

export const categoryKeys = {
  all: (userId: string | undefined) => ['categories', userId] as const,
  list: (userId: string | undefined, kind: CategoryKind | undefined, includeArchived: boolean) =>
    ['categories', userId, 'list', { kind: kind ?? null, includeArchived }] as const,
  templates: () => ['category-templates'] as const,
}
