import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import mascotMoni from '@/assets/mascot/expresion_feliz.svg'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { useTransactions } from '@/features/transactions/api/useTransactions'
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
import { formatMonthName } from '@/shared/lib/dates'
import { monthStart, todayIso } from '@/shared/lib/month'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { getCategoryIcon, themedColor, tint } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MENTA_CIRCLE } from '@/shared/ui/mentaStyles'
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
import { countUncategorized } from '../domain/uncategorized'
import { CategoryForm } from './CategoryForm'
import { withAmountFormatting } from '@/shared/ui/amountField'

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
  const monthTransactions = useTransactions({ from: monthStart(todayIso()), to: todayIso() })
  const uncategorized = countUncategorized(monthTransactions.data ?? [], todayIso())
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
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader
        title="Categorías"
        subtitle={`${list.length} ${list.length === 1 ? 'categoría' : 'categorías'} · ${formatMonthName(monthStart(todayIso())).toLowerCase()}`}
        backTo="/perfil"
        action={
          <button type="button" onClick={() => startEditing()} aria-label="Nueva categoría" className={MENTA_CIRCLE}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </button>
        }
      />
      <SegmentedControl
        label="Tipo de categoría"
        options={KIND_OPTIONS}
        variant="menta"
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
        <ul aria-label="Categorías" className="grid grid-cols-3 gap-2.5">
          {list.map((category) => {
            const spent = spentById.get(category.id) ?? 0
            const budget = budgetsByCategory.get(category.id)
            const Icon = getCategoryIcon(category.icon)
            return (
              <li key={category.id} className="flex">
                <button
                  type="button"
                  onClick={() => startEditing(category)}
                  aria-label={`Editar ${category.name}`}
                  className={cn('flex w-full min-w-0 flex-col gap-2.5 rounded-3xl bg-card px-3 py-3.5 text-left', FOCUS_RING)}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px]"
                    style={{ backgroundColor: tint(category.color), color: themedColor(category.color) }}
                  >
                    <Icon className="size-[19px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-bold">{category.name}</span>
                    <span className="block truncate text-[12.5px] text-text-muted">
                      {spent > 0 ? (
                        <AmountDisplay cents={spent} />
                      ) : kind === 'expense' ? (
                        'Sin gastos'
                      ) : (
                        'Sin ingresos'
                      )}
                    </span>
                    {budget && <BudgetBadge budget={budget} className="mt-1" />}
                  </span>
                </button>
              </li>
            )
          })}
          <li className="flex">
            <button
              type="button"
              onClick={() => startEditing()}
              className={cn(
                'flex min-h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-3xl border-[1.5px] border-dashed border-[#9DB5A5] text-[13px] font-medium text-[#4F6157] dark:text-text-muted',
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
              Nueva
            </button>
          </li>
        </ul>
      )}

      {uncategorized > 0 && (
        <Link
          to="/actividad"
          className={cn('flex items-center gap-3 rounded-3xl bg-lilac-soft px-3.5 py-3', FOCUS_RING)}
        >
          <img src={mascotMoni} alt="" className="size-8 shrink-0 rounded-full" />
          <span className="text-[13.5px] text-lilac-ink dark:text-ink">
            Tengo {uncategorized} {uncategorized === 1 ? 'movimiento' : 'movimientos'} sin categoría. ¿Los ordenamos?
          </span>
        </Link>
      )}

      {kind === 'expense' && <BudgetSuggestions />}

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
              <label className="flex items-center gap-3 rounded-[18px] border border-line bg-card px-4 py-3">
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
                    onChange={withAmountFormatting((e) => setLimitText(e.target.value))}
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
