import type { Account } from '@/features/accounts/domain/account'
import { toDrafts, type DraftMovement, type ParseResponse } from '@/features/ai/domain/draft'
import type { Category } from '@/features/categories/domain/category'

/** When the AI cannot tell the category: "Otros" if the person has one (a category is never invented). */
export function fallbackCategory(
  categories: readonly Category[],
  kind: DraftMovement['kind'],
): string {
  return categories.find((c) => c.kind === kind && /^otros?$/i.test(c.name.trim()))?.id ?? ''
}

/**
 * Drafts for the confirmation cards. The account is never guessed: with a single account there is nothing to choose,
 * otherwise (none named by the AI) the person picks it. Without a category the draft gets "Otros" when it exists.
 */
export function prepareDrafts(
  response: ParseResponse,
  accounts: readonly Account[],
  categories: readonly Category[],
): DraftMovement[] {
  const onlyAccount = accounts.length === 1 ? (accounts[0]?.id ?? '') : ''
  return toDrafts(response, onlyAccount).map((d) => ({
    ...d,
    categoryId: d.categoryId || fallbackCategory(categories, d.kind),
  }))
}
