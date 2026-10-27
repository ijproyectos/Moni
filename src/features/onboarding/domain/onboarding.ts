import { z } from 'zod'

export const onboardingSchema = z.object({
  goals: z.array(z.string().min(1).max(40)).max(10),
  templateSlugs: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1, 'Elegí al menos una categoría.'),
})

export type OnboardingValues = z.infer<typeof onboardingSchema>

/** Templates preselected on the categories step: all of them, the user opts out. */
export function defaultTemplateSlugs(templates: readonly { slug: string }[]): string[] {
  return templates.map((t) => t.slug)
}

export function toggleSlug(selected: readonly string[], slug: string): string[] {
  return selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]
}
