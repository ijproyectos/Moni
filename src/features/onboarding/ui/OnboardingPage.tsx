import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { peekReturnTo } from '@/features/auth/domain/returnTo'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { CategoryForm } from '@/features/categories/ui/CategoryForm'
import { ProPaywall } from '@/features/pro/ui/ProPaywall'
import type { CategoryKind } from '@/shared/lib/database.types'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ProgressHeader } from '@/shared/ui/ProgressHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useCompleteOnboarding } from '../api/useCompleteOnboarding'
import { goalsToPersist, toggleGoal } from '../domain/goals'
import { clearDraft, loadDraft, saveDraft } from '../domain/localPreferences'
import {
  customNameTaken,
  defaultTemplateSlugs,
  ONBOARDING_STEPS,
  parseStep,
  PRO_STEP,
  toggleSlug,
  type CustomCategory,
} from '../domain/onboarding'
import { OnboardingBenefitsStep } from './OnboardingBenefitsStep'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingCurrencyStep } from './OnboardingCurrencyStep'
import { OnboardingGoalsStep } from './OnboardingGoalsStep'
import { OnboardingNotificationsStep } from './OnboardingNotificationsStep'

/**
 * Onboarding flow (screens 002-013). The current step lives in the URL (?paso=N) so the browser
 * back/forward buttons move between steps, and the answers are kept as a session draft so a reload
 * does not lose them. Nothing is saved in Supabase until the last screen, so the "already
 * onboarded" redirect cannot cut the flow short.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const userId = user?.id ?? 'anon'
  const { data: profile } = useProfile()
  const templatesQuery = useCategoryTemplates()
  const complete = useCompleteOnboarding()

  const [draft] = useState(() => loadDraft(userId))
  const [goals, setGoals] = useState<string[]>(draft?.goals ?? [])
  const [slugs, setSlugs] = useState<string[] | null>(draft?.slugs ?? null)
  const [custom, setCustom] = useState<CustomCategory[]>(draft?.custom ?? [])
  const [usesDollars, setUsesDollars] = useState(draft?.usesDollars ?? false)
  const [notificationsOptIn, setNotificationsOptIn] = useState<boolean | null>(
    draft?.notificationsOptIn ?? null,
  )
  const [creatingKind, setCreatingKind] = useState<CategoryKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requested = parseStep(params.get('paso'))
  const templates = templatesQuery.data ?? []
  // Everything is preselected once the templates arrive; the person opts out.
  useEffect(() => {
    if (slugs === null && templatesQuery.data) setSlugs(defaultTemplateSlugs(templatesQuery.data))
  }, [slugs, templatesQuery.data])
  const selected = slugs ?? []
  const hasCategories = selected.length + custom.length > 0
  // Deep links or reloads can't skip past the categories step without a valid choice.
  const step = requested > 4 && slugs !== null && !hasCategories ? 4 : requested

  useEffect(() => {
    saveDraft(userId, { goals, slugs, custom, usesDollars, notificationsOptIn })
  }, [userId, goals, slugs, custom, usesDollars, notificationsOptIn])

  function goTo(next: number) {
    setError(null)
    setParams(next === 1 ? {} : { paso: String(next) })
  }

  // Mirrors the browser back button when there is history; otherwise steps back explicitly.
  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else goTo(step - 1)
  }

  async function finish(optIn: boolean | null = notificationsOptIn) {
    if (complete.isPending) return
    setError(null)
    try {
      await complete.mutateAsync({
        goals: goalsToPersist(goals),
        templateSlugs: selected,
        customCategories: custom,
        secondaryCurrency: usesDollars ? 'USD' : null,
        notificationsOptIn: optIn,
      })
      clearDraft(userId)
      navigate(peekReturnTo() ?? '/', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (step === PRO_STEP) {
    return (
      <main className="min-h-dvh w-full bg-forest">
        <ProPaywall
          onClose={() => void finish()}
          onStartTrial={() => void finish()}
          busy={complete.isPending}
          error={
            error && `${error} Tocá “Ahora no” para reintentar; tus respuestas siguen guardadas.`
          }
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-forest text-cream">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-6">
        <ProgressHeader step={step} total={ONBOARDING_STEPS} onBack={step > 1 ? back : undefined} />

        {step === 1 && (
          <OnboardingGoalsStep
            selected={goals}
            onToggle={(id) => setGoals((g) => toggleGoal(g, id))}
            onContinue={() => goTo(2)}
            onSkip={() => {
              setGoals([])
              goTo(2)
            }}
          />
        )}
        {step === 2 && (
          <OnboardingBenefitsStep
            name={firstName(profile?.display_name)}
            onContinue={() => goTo(3)}
          />
        )}
        {step === 3 && (
          <OnboardingCurrencyStep
            usesDollars={usesDollars}
            onUsesDollarsChange={setUsesDollars}
            onContinue={() => goTo(4)}
          />
        )}
        {step === 4 &&
          (templatesQuery.isLoading ? (
            <div
              role="status"
              aria-label="Cargando categorías"
              className="mt-10 flex flex-col gap-3"
            >
              <Skeleton className="h-9 bg-surface" />
              <Skeleton className="h-40 bg-surface" />
            </div>
          ) : templatesQuery.isError ? (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p role="alert" className="text-blush">
                No pudimos cargar las categorías. Revisá tu conexión.
              </p>
              <Button onClick={() => void templatesQuery.refetch()} className="w-auto px-8">
                Reintentar
              </Button>
            </div>
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
              onCreate={() => setCreatingKind('expense')}
              onRemoveCustom={(c) =>
                setCustom((list) => list.filter((x) => !(x.kind === c.kind && x.name === c.name)))
              }
              onContinue={() => goTo(5)}
            />
          ))}
        {step === 5 && (
          <OnboardingNotificationsStep
            isBusy={complete.isPending}
            onContinue={(optIn) => {
              setNotificationsOptIn(optIn)
              goTo(PRO_STEP)
            }}
          />
        )}
      </div>

      {creatingKind && (
        <BottomSheet title="Nueva categoría" onClose={() => setCreatingKind(null)}>
          <SegmentedControl
            label="Tipo de categoría"
            className="mb-4"
            value={creatingKind}
            onChange={setCreatingKind}
            options={[
              { value: 'expense', label: 'Gasto' },
              { value: 'income', label: 'Ingreso' },
            ]}
          />
          <CategoryForm
            key={creatingKind}
            kind={creatingKind}
            validateName={(name) =>
              customNameTaken(name, creatingKind, templates, selected, custom)
                ? 'Ya tenés una categoría con ese nombre.'
                : null
            }
            isSubmitting={false}
            submitError={custom.length >= 20 ? 'Podés crear hasta 20 categorías acá.' : null}
            onSubmit={(values) => {
              if (custom.length >= 20) return
              setCustom((c) => [...c, { ...values, name: values.name.trim() }])
              setCreatingKind(null)
            }}
          />
        </BottomSheet>
      )}
    </main>
  )
}
