import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { dashboardKeys } from '@/features/dashboard/api/queryKeys'
import type { CategoryKind } from '@/shared/lib/database.types'
import type { CategoryFormValues } from '../domain/category'
import {
  createCategory,
  listCategories,
  listCategoryTemplates,
  setCategoryArchived,
  updateCategory,
} from './categoriesRepository'
import { categoryKeys } from './queryKeys'

/**
 * The user's categories. Pass `includeArchived` to resolve names of old movements
 * whose category was archived later.
 */
export function useCategories(kind?: CategoryKind, options: { includeArchived?: boolean } = {}) {
  const { user } = useAuth()
  const includeArchived = options.includeArchived ?? false

  return useQuery({
    queryKey: categoryKeys.list(user?.id, kind, includeArchived),
    enabled: Boolean(user),
    queryFn: () => listCategories(kind, includeArchived),
  })
}

export function useCategoryTemplates() {
  return useQuery({
    queryKey: categoryKeys.templates(),
    queryFn: listCategoryTemplates,
    staleTime: Infinity,
  })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(user?.id) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(user?.id) }),
    ])
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (values: CategoryFormValues) => createCategory(values),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Omit<CategoryFormValues, 'kind'> }) =>
      updateCategory(id, values),
    onSuccess: invalidate,
  })
}

export function useArchiveCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ id, archived = true }: { id: string; archived?: boolean }) =>
      setCategoryArchived(id, archived),
    onSuccess: invalidate,
  })
}
