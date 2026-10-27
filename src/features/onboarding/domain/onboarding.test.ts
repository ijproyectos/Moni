import { defaultTemplateSlugs, onboardingSchema, toggleSlug } from './onboarding'

describe('onboarding domain', () => {
  it('requires at least one category', () => {
    expect(onboardingSchema.safeParse({ goals: [], templateSlugs: [] }).success).toBe(false)
    expect(
      onboardingSchema.safeParse({ goals: ['ahorrar'], templateSlugs: ['comida'] }).success,
    ).toBe(true)
  })

  it('toggles slugs without mutating the input', () => {
    const selected = ['comida']
    expect(toggleSlug(selected, 'salud')).toEqual(['comida', 'salud'])
    expect(toggleSlug(selected, 'comida')).toEqual([])
    expect(selected).toEqual(['comida'])
  })

  it('preselects every template', () => {
    expect(defaultTemplateSlugs([{ slug: 'a' }, { slug: 'b' }])).toEqual(['a', 'b'])
  })
})
