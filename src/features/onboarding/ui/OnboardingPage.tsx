import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { peekReturnTo } from '@/features/auth/domain/returnTo'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { ProgressHeader } from '@/shared/ui/ProgressHeader'
import { useCompleteOnboarding } from '../api/useCompleteOnboarding'
import { goalsToPersist, toggleGoal } from '../domain/goals'
import { defaultTemplateSlugs, toggleSlug } from '../domain/onboarding'
import { OnboardingBenefitsStep } from './OnboardingBenefitsStep'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingCurrencyStep } from './OnboardingCurrencyStep'
import { OnboardingGoalsStep } from './OnboardingGoalsStep'

const TOTAL_STEPS = 4

/** Container for the onboarding flow (screens 02-05). Screens 06 and 07 are out of the MVP. */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const templatesQuery = useCategoryTemplates()
  const complete = useCompleteOnboarding()

  const [step, setStep] = useState(1)
  const [goals, setGoals] = useState<string[]>([])
  const [slugs, setSlugs] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const templates = templatesQuery.data ?? []
  // Everything is preselected once the templates arrive; the person opts out.
  useEffect(() => {
    if (slugs === null && templatesQuery.data) setSlugs(defaultTemplateSlugs(templatesQuery.data))
  }, [slugs, templatesQuery.data])
  const selected = slugs ?? []

  async function finish() {
    setError(null)
    try {
      await complete.mutateAsync({ goals: goalsToPersist(goals), templateSlugs: selected })
      navigate(peekReturnTo() ?? '/', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
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
              onToggle={(slug) => setSlugs((s) => toggleSlug(s ?? [], slug))}
              onToggleAll={() =>
                setSlugs(
                  selected.length === templates.length ? [] : defaultTemplateSlugs(templates),
                )
              }
              onFinish={() => void finish()}
              isSaving={complete.isPending}
              error={error}
            />
          ))}
      </div>
    </main>
  )
}
