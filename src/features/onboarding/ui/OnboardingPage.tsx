import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { peekReturnTo } from '@/features/auth/domain/returnTo'
import { useCategoryTemplates, useCreateCategory } from '@/features/categories/api/useCategories'
import { CategoryForm } from '@/features/categories/ui/CategoryForm'
import { ProPaywall } from '@/features/pro/ui/ProPaywall'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { ProgressHeader } from '@/shared/ui/ProgressHeader'
import { useCompleteOnboarding } from '../api/useCompleteOnboarding'
import { goalsToPersist, toggleGoal } from '../domain/goals'
import { defaultTemplateSlugs, toggleSlug } from '../domain/onboarding'
import { OnboardingBenefitsStep } from './OnboardingBenefitsStep'
import { OnboardingCategoriesStep, type CustomCategoryChip } from './OnboardingCategoriesStep'
import { OnboardingCurrencyStep } from './OnboardingCurrencyStep'
import { OnboardingGoalsStep } from './OnboardingGoalsStep'
import { OnboardingNotificationsStep } from './OnboardingNotificationsStep'

/** Steps with a progress bar; the Pro offer (step 6) is a full screen without it. */
const TOTAL_STEPS = 5
const PRO_STEP = 6

type CustomCategory = CustomCategoryChip & { color: string }

/**
 * Onboarding flow (screens 002-013). Nothing is saved until the last screen, so the
 * "already onboarded" redirect cannot cut the flow short.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const templatesQuery = useCategoryTemplates()
  const complete = useCompleteOnboarding()
  const createCategory = useCreateCategory()

  const [step, setStep] = useState(1)
  const [goals, setGoals] = useState<string[]>([])
  const [slugs, setSlugs] = useState<string[] | null>(null)
  const [custom, setCustom] = useState<CustomCategory[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const templates = templatesQuery.data ?? []
  // Everything is preselected once the templates arrive; the person opts out.
  useEffect(() => {
    if (slugs === null && templatesQuery.data) setSlugs(defaultTemplateSlugs(templatesQuery.data))
  }, [slugs, templatesQuery.data])
  const selected = slugs ?? []
  const isSaving = complete.isPending || createCategory.isPending

  async function finish() {
    setError(null)
    try {
      await complete.mutateAsync({ goals: goalsToPersist(goals), templateSlugs: selected })
      for (const { name, icon, color, kind } of custom) {
        await createCategory.mutateAsync({ name, icon, color, kind })
      }
      navigate(peekReturnTo() ?? '/', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  function nameTaken(name: string, kind: 'expense' | 'income'): string | null {
    const wanted = name.trim().toLowerCase()
    const inTemplates = templates.some(
      (t) => t.kind === kind && selected.includes(t.slug) && t.name.toLowerCase() === wanted,
    )
    const inCustom = custom.some((c) => c.kind === kind && c.name.toLowerCase() === wanted)
    return inTemplates || inCustom ? 'Ya tenés una categoría con ese nombre.' : null
  }

  if (step === PRO_STEP) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-[430px] bg-forest">
        <ProPaywall
          onClose={() => void finish()}
          onStartTrial={() => void finish()}
          busy={isSaving}
          error={error}
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-forest text-cream">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-6">
        <ProgressHeader
          step={step}
          total={TOTAL_STEPS}
          onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
        />

        {step === 1 && (
          <OnboardingGoalsStep
            selected={goals}
            onToggle={(id) => setGoals((g) => toggleGoal(g, id))}
            onContinue={() => setStep(2)}
            onSkip={() => {
              setGoals([])
              setStep(2)
            }}
          />
        )}
        {step === 2 && (
          <OnboardingBenefitsStep
            name={firstName(profile?.display_name)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && <OnboardingCurrencyStep onContinue={() => setStep(4)} />}
        {step === 4 &&
          (templatesQuery.isError ? (
            <p role="alert" className="mt-16 text-center text-blush">
              No pudimos cargar las categorías. Probá de nuevo en un rato.
            </p>
          ) : (
            <OnboardingCategoriesStep
              templates={templates}
              selected={selected}
              custom={custom}
              onToggle={(slug) => setSlugs((s) => toggleSlug(s ?? [], slug))}
              onToggleAll={() =>
                setSlugs(
                  selected.length === templates.length ? [] : defaultTemplateSlugs(templates),
                )
              }
              onCreate={() => setCreating(true)}
              onRemoveCustom={(name) => setCustom((c) => c.filter((x) => x.name !== name))}
              onContinue={() => setStep(5)}
            />
          ))}
        {step === 5 && <OnboardingNotificationsStep onContinue={() => setStep(PRO_STEP)} />}
      </div>

      {creating && (
        <BottomSheet title="Nueva categoría" onClose={() => setCreating(false)}>
          <CategoryForm
            kind="expense"
            validateName={(name) => nameTaken(name, 'expense')}
            isSubmitting={false}
            submitError={null}
            onSubmit={(values) => {
              setCustom((c) => [...c, { ...values, name: values.name.trim() }])
              setCreating(false)
            }}
          />
        </BottomSheet>
      )}
    </main>
  )
}
