import { z } from 'zod'
import { categoryFormSchema } from '@/features/categories/domain/category'

export const customCategorySchema = categoryFormSchema

export type CustomCategory = z.infer<typeof customCategorySchema>

export const onboardingSchema = z
  .object({
    goals: z.array(z.string().min(1).max(40)).max(10),
    templateSlugs: z.array(z.string().regex(/^[a-z0-9_]+$/)),
    customCategories: z.array(customCategorySchema).max(20).default([]),
    secondaryCurrency: z.enum(['USD']).nullable().default(null),
    notificationsOptIn: z.boolean().nullable().default(null),
  })
  .refine((v) => v.templateSlugs.length + v.customCategories.length > 0, {
    message: 'Elegí al menos una categoría.',
    path: ['templateSlugs'],
  })

export type OnboardingInput = z.input<typeof onboardingSchema>
export type OnboardingValues = z.output<typeof onboardingSchema>

/** Templates preselected on the categories step: all of them, the user opts out. */
export function defaultTemplateSlugs(templates: readonly { slug: string }[]): string[] {
  return templates.map((t) => t.slug)
}

export function toggleSlug(selected: readonly string[], slug: string): string[] {
  return selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]
}

/** Case-insensitive name clash with a selected template or another custom category of the same kind. */
export function customNameTaken(
  name: string,
  kind: 'expense' | 'income',
  templates: readonly { slug: string; name: string; kind: string }[],
  selectedSlugs: readonly string[],
  custom: readonly { name: string; kind: string }[],
): boolean {
  const wanted = name.trim().toLowerCase()
  return (
    templates.some(
      (t) => t.kind === kind && selectedSlugs.includes(t.slug) && t.name.toLowerCase() === wanted,
    ) || custom.some((c) => c.kind === kind && c.name.trim().toLowerCase() === wanted)
  )
}

/** Onboarding steps shown with a progress bar; the Pro offer is step 6 (no bar). */
export const ONBOARDING_STEPS = 5
export const PRO_STEP = 6

/** Reads ?paso=N, clamped to a valid step. */
export function parseStep(value: string | null): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= PRO_STEP ? n : 1
}
