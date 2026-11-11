import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { peekReturnTo } from '@/features/auth/domain/returnTo'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { CategoryForm } from '@/features/categories/ui/CategoryForm'
import { ProPaywall } from '@/features/pro/ui/ProPaywall'
import { FEATURES } from '@/shared/config/features'
import type { CategoryKind } from '@/shared/lib/database.types'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Button } from '@/shared/ui/Button'
import { ProgressHeader } from '@/shared/ui/ProgressHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useCompleteOnboarding } from '../api/useCompleteOnboarding'
import { goalsToPersist, toggleGoal } from '../domain/goals'
import { updateProfileExtras } from '@/features/settings/mock/profileExtrasStore'
import { clearDraft, loadDraft, mergeLocalPreferences, saveDraft } from '../domain/localPreferences'
import {
  customNameTaken,
  defaultTemplateSlugs,
  ONBOARDING_STEPS,
  parseStep,
  PRO_STEP,
  toggleSlug,
  type CustomCategory,
  type OnboardingInput,
} from '../domain/onboarding'
import { OnboardingBenefitsStep, type SlideTint } from './OnboardingBenefitsStep'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingCurrencyStep } from './OnboardingCurrencyStep'
import { OnboardingGoalsStep } from './OnboardingGoalsStep'
import { OnboardingIncomeStep, type IncomeAnswer } from './OnboardingIncomeStep'
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
  const [income, setIncome] = useState<IncomeAnswer | null>(draft?.income ?? null)
  const [creatingKind, setCreatingKind] = useState<CategoryKind | null>(null)
  // "Omitir configuración" throws away the answers, so it asks first.
  const [confirmingSkipAll, setConfirmingSkipAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The benefits slides tint the whole screen; every other step uses the canvas.
  const [tint, setTint] = useState<SlideTint | null>(null)
  const onTint = useCallback((t: SlideTint | null) => setTint(t), [])

  const requested = parseStep(params.get('paso'))
  const templates = templatesQuery.data ?? []
  // Everything is preselected once the templates arrive; the person opts out.
  useEffect(() => {
    if (slugs === null && templatesQuery.data) setSlugs(defaultTemplateSlugs(templatesQuery.data))
  }, [slugs, templatesQuery.data])
  const selected = slugs ?? []
  const hasCategories = selected.length + custom.length > 0
  // Deep links or reloads can't skip past the categories step without a valid choice.
  const lastStep = FEATURES.pro ? PRO_STEP : ONBOARDING_STEPS
  const step = Math.min(requested > 4 && slugs !== null && !hasCategories ? 4 : requested, lastStep)

  useEffect(() => {
    saveDraft(userId, { goals, slugs, custom, usesDollars, notificationsOptIn, income })
  }, [userId, goals, slugs, custom, usesDollars, notificationsOptIn, income])

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

  async function submit(input: OnboardingInput, skipIncome = false) {
    if (complete.isPending) return
    setError(null)
    try {
      await complete.mutateAsync(input)
      // Income and pay day have no column yet: they stay on this device, in the existing preferences.
      if (income && !skipIncome) {
        mergeLocalPreferences(userId, { monthlyIncomeCents: income.incomeCents, payDay: income.payDay })
        updateProfileExtras({ monthlyIncomeCents: income.incomeCents })
      }
      clearDraft(userId)
      navigate(peekReturnTo() ?? '/', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  function finish(optIn: boolean | null = notificationsOptIn) {
    return submit({
      goals: goalsToPersist(goals),
      templateSlugs: selected,
      customCategories: custom,
      secondaryCurrency: usesDollars ? 'USD' : null,
      notificationsOptIn: optIn,
    })
  }

  // "Omitir configuración" (after confirming): finish right away with the defaults, ignoring the answers given so far.
  function skipAll() {
    const defaults = defaultTemplateSlugs(templates)
    if (defaults.length === 0) {
      setError('Todavía no pudimos cargar las categorías. Probá de nuevo en un momento.')
      return
    }
    return submit({
      goals: [],
      templateSlugs: defaults,
      customCategories: [],
      secondaryCurrency: null,
      notificationsOptIn: null,
    }, true)
  }

  if (step === PRO_STEP) {
    return (
      <main className="min-h-dvh w-full bg-canvas">
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
    <main
      className="min-h-dvh bg-[var(--ob-light,var(--color-canvas))] text-ink transition-colors duration-300 dark:bg-[var(--ob-dark,var(--color-canvas))]"
      style={
        tint ? ({ '--ob-light': tint.light, '--ob-dark': tint.dark } as CSSProperties) : undefined
      }
    >
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
            onSkip={() => goTo(3)}
            onSkipAll={() => setConfirmingSkipAll(true)}
            onTint={onTint}
            isBusy={complete.isPending}
          />
        )}
        {step === 3 && (
          <OnboardingCurrencyStep
            usesDollars={usesDollars}
            onUsesDollarsChange={setUsesDollars}
            onContinue={() => goTo(4)}
            // Skipping the currency keeps pesos only.
            onSkip={() => {
              setUsesDollars(false)
              goTo(4)
            }}
            onSkipAll={() => setConfirmingSkipAll(true)}
            isBusy={complete.isPending}
          />
        )}
        {step === 4 &&
          (templatesQuery.isLoading ? (
            <div
              role="status"
              aria-label="Cargando categorías"
              className="mt-10 flex flex-col gap-3"
            >
              <Skeleton className="h-9" />
              <Skeleton className="h-40" />
            </div>
          ) : templatesQuery.isError ? (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p role="alert" className="font-bold text-expense">
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
              // Skipping the categories keeps the suggested ones (and the ones the person created).
              onSkip={() => {
                setSlugs(defaultTemplateSlugs(templates))
                goTo(5)
              }}
              onSkipAll={() => setConfirmingSkipAll(true)}
              isBusy={complete.isPending}
            />
          ))}
        {step === 5 && (
          <OnboardingIncomeStep
            initial={income}
            onContinue={(answer) => {
              setIncome(answer)
              goTo(6)
            }}
            // Skipping the income keeps it unset: Moni never invents one.
            onSkip={() => {
              setIncome(null)
              goTo(6)
            }}
            onSkipAll={() => setConfirmingSkipAll(true)}
            isBusy={complete.isPending}
          />
        )}
        {step === 6 && (
          <OnboardingNotificationsStep
            isBusy={complete.isPending}
            onContinue={(optIn) => {
              setNotificationsOptIn(optIn)
              // Without the Pro paywall (no real billing yet) the flow ends right here.
              if (FEATURES.pro) goTo(PRO_STEP)
              else void finish(optIn)
            }}
            onSkipAll={() => setConfirmingSkipAll(true)}
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-sm font-bold text-expense">
            {error}
          </p>
        )}
      </div>

      {confirmingSkipAll && (
        <ConfirmDialog
          title="¿Omitir la configuración?"
          message="Terminamos ahora con los valores por defecto: todas las categorías sugeridas, solo pesos, sin objetivos y sin avisos. Lo que elegiste hasta acá no se guarda. Lo podés cambiar después desde Perfil."
          confirmLabel="Omitir y terminar"
          cancelLabel="Seguir configurando"
          isBusy={complete.isPending}
          onConfirm={() => {
            setConfirmingSkipAll(false)
            void skipAll()
          }}
          onCancel={() => setConfirmingSkipAll(false)}
        />
      )}
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
