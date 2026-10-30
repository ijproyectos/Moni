import { Pencil } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import type { CategoryKind } from '@/shared/lib/database.types'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useMonthSummary } from '@/features/dashboard/api/useMonthSummary'
import {
  useArchiveBudget,
  useBudgetStatus,
  useCreateBudget,
  useUpdateBudget,
} from '@/features/budgets/api/useBudgets'
import { budgetByCategory, parseBudgetLimit } from '@/features/budgets/domain/budget'
import { BudgetBadge } from '@/features/budgets/ui/BudgetBadge'
import { BudgetSuggestions } from '@/features/budgets/ui/BudgetSuggestions'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { HeaderAddButton } from '@/shared/ui/kit'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from '../api/useCategories'
import {
  CATEGORY_KIND_LABELS,
  categoriesByKind,
  isCategoryNameTaken,
  type Category,
  type CategoryFormValues,
} from '../domain/category'
import { CategoryForm } from './CategoryForm'

const KIND_OPTIONS = (['expense', 'income'] as const).map((value) => ({
  value,
  label: CATEGORY_KIND_LABELS[value],
}))

type Editing = { category?: Category } | null

export function CategoriesPage() {
  const categories = useCategories()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const archive = useArchiveCategory()
  const toast = useToast()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Editing>(null)
  const [archiving, setArchiving] = useState<Category | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const all = categories.data ?? []
  const list = categoriesByKind(all, kind)
  const month = useMonthSummary(todayIso())
  const spentById = new Map(
    (month.data?.byCategory ?? []).map((c) => [c.categoryId, c.amountCents]),
  )
  const budgetStatus = useBudgetStatus(todayIso())
  const budgetsByCategory = budgetByCategory(budgetStatus.data ?? [])
  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()
  const archiveBudget = useArchiveBudget()
  const [limitText, setLimitText] = useState('')

  function startEditing(category?: Category) {
    setSubmitError(null)
    const limit = category ? budgetsByCategory.get(category.id)?.amountCents : undefined
    setLimitText(limit ? formatAmountInput(limit) : '')
    setEditing(category ? { category } : {})
  }

  async function save(values: CategoryFormValues) {
    setSubmitError(null)
    const limit = parseBudgetLimit(limitText)
    if (editing?.category && !limit.ok) {
      setSubmitError('Ingresá un límite mayor a cero, o dejalo vacío para no ponerlo.')
      return
    }
    try {
      if (editing?.category) {
        await update.mutateAsync({
          id: editing.category.id,
          values: { name: values.name, icon: values.icon, color: values.color },
        })
        if (limit.ok) await saveLimit(editing.category.id, limit.cents)
      } else {
        await create.mutateAsync({ ...values, kind })
      }
      toast.show(editing?.category ? 'Categoría actualizada' : 'Categoría creada', {
        mascotUrl: mascotHappy,
      })
      setEditing(null)
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  /** Creates, changes or archives the category's monthly limit so it matches what was typed. */
  async function saveLimit(categoryId: string, cents: number | null) {
    const current = budgetsByCategory.get(categoryId)
    if (!current) {
      if (cents !== null) await createBudget.mutateAsync({ categoryId, amountCents: cents })
    } else if (cents === null) {
      await archiveBudget.mutateAsync({ id: current.budgetId })
    } else if (cents !== current.amountCents) {
      await updateBudget.mutateAsync({ id: current.budgetId, amountCents: cents })
    }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archive.mutateAsync({ id: archiving.id })
      toast.show('Categoría archivada')
      setEditing(null)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    } finally {
      setArchiving(null)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-14">
      <PageHeader
        title="Categorías"
        backTo="/mas"
        action={<HeaderAddButton label="Nueva categoría" onClick={() => startEditing()} />}
      />
      <SegmentedControl
        label="Tipo de categoría"
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
      />

      {categories.isLoading ? (
        <div role="status" aria-label="Cargando categorías" className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : categories.isError ? (
        <EmptyState
          mascotUrl={mascotAlert}
          title="No pudimos cargar tus categorías"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void categories.refetch()}>Reintentar</Button>}
        />
      ) : list.length === 0 ? (
        <EmptyState
          mascotUrl={mascotHappy}
          title="Todavía no tenés categorías"
          description="Creá la primera para ordenar tus movimientos."
        />
      ) : (
        <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
          {list.map((category) => {
            const spent = spentById.get(category.id) ?? 0
            const budget = budgetsByCategory.get(category.id)
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => startEditing(category)}
                  aria-label={`Editar ${category.name}`}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <CategoryIconCircle
                    iconName={category.icon}
                    color={category.color}
                    className="size-12"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] font-extrabold">
                      {category.name}
                    </span>
                    <span className="block text-[15px] text-text-muted">
                      {spent > 0
                        ? `${formatArs(spent)} este mes`
                        : kind === 'expense'
                          ? 'Sin gastos'
                          : 'Sin ingresos'}
                    </span>
                    {budget && <BudgetBadge budget={budget} className="mt-1" />}
                  </span>
                  <Pencil aria-hidden="true" className="size-5 text-ink" strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {kind === 'expense' && <BudgetSuggestions />}

      <p className="px-1 text-[15px] leading-5 text-text-muted">
        Tocá una categoría para cambiar el nombre, el ícono, el color o ponerle un límite.
      </p>

      {editing && (
        <BottomSheet
          title={editing.category ? 'Editar categoría' : 'Nueva categoría'}
          onClose={() => setEditing(null)}
        >
          <CategoryForm
            kind={editing.category?.kind ?? kind}
            initial={editing.category}
            validateName={(name) =>
              isCategoryNameTaken(all, editing.category?.kind ?? kind, name, editing.category?.id)
                ? 'Ya tenés una categoría con ese nombre.'
                : null
            }
            isSubmitting={
              create.isPending ||
              update.isPending ||
              createBudget.isPending ||
              updateBudget.isPending ||
              archiveBudget.isPending
            }
            submitError={submitError}
            onSubmit={(values) => void save(values)}
            onArchive={editing.category ? () => setArchiving(editing.category ?? null) : undefined}
          >
            {editing.category?.kind === 'expense' && (
              <label className="flex items-center gap-3 rounded-[18px] border border-sand bg-card px-4 py-3">
                <span className="flex-1">
                  <span className="block text-[17px] font-extrabold">Límite por mes</span>
                  <span className="block text-[14px] text-text-muted">
                    Moni te avisa cuando llegás al 80%
                  </span>
                </span>
                <span className="flex items-baseline text-[22px] font-extrabold">
                  $
                  <input
                    value={limitText}
                    onChange={(e) => setLimitText(e.target.value)}
                    inputMode="decimal"
                    placeholder="Sin límite"
                    aria-label="Límite por mes"
                    className="w-28 bg-transparent text-right outline-none placeholder:text-[15px] placeholder:font-bold placeholder:text-text-muted"
                  />
                </span>
              </label>
            )}
          </CategoryForm>
        </BottomSheet>
      )}
      {archiving && (
        <ConfirmDialog
          title="¿Eliminar esta categoría?"
          message={`"${archiving.name}" deja de aparecer para cargar movimientos nuevos. Los que ya cargaste se mantienen.`}
          confirmLabel="Eliminar"
          isBusy={archive.isPending}
          onConfirm={() => void confirmArchive()}
          onCancel={() => setArchiving(null)}
        />
      )}
    </section>
  )
}
