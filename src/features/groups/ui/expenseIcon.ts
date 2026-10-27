import { ReceiptText, type LucideIcon } from 'lucide-react'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'

/** Icon for an expense row: its category template, or a receipt. */
export function expenseIcon(
  templates: readonly CategoryTemplate[],
  slug: string | null,
): LucideIcon {
  const template = slug ? templates.find((t) => t.slug === slug) : undefined
  return template ? getCategoryIcon(template.icon) : ReceiptText
}
