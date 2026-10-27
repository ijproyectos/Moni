import type {
  Category as CategoryRow,
  CategoryKind,
  CategoryTemplate as CategoryTemplateRow,
} from '@/shared/lib/database.types'
import { getSupabase } from '@/shared/lib/supabase'
import type { Category, CategoryFormValues, CategoryTemplate } from '../domain/category'

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    icon: row.icon,
    color: row.color,
    archivedAt: row.archived_at,
  }
}

function toTemplate(row: CategoryTemplateRow): CategoryTemplate {
  return {
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
  }
}

export async function listCategories(
  kind: CategoryKind | undefined,
  includeArchived: boolean,
): Promise<Category[]> {
  let query = getSupabase().from('categories').select('*').order('name', { ascending: true })
  if (kind) query = query.eq('kind', kind)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return data.map(toCategory)
}

export async function listCategoryTemplates(): Promise<CategoryTemplate[]> {
  const { data, error } = await getSupabase()
    .from('category_templates')
    .select('*')
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(toTemplate)
}

export async function createCategory(values: CategoryFormValues): Promise<void> {
  const { error } = await getSupabase().from('categories').insert(values)
  if (error) throw error
}

/** Kind is immutable after creation: existing movements would no longer match. */
export async function updateCategory(
  id: string,
  values: Omit<CategoryFormValues, 'kind'>,
): Promise<void> {
  const { error } = await getSupabase().from('categories').update(values).eq('id', id)
  if (error) throw error
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('categories')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}
