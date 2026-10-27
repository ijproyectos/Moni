import { Plus } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import type { CategoryKind } from '@/shared/lib/database.types'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
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

  async function save(values: CategoryFormValues) {
    setSubmitError(null)
    try {
      if (editing?.category) {
        await update.mutateAsync({
          id: editing.category.id,
          values: { name: values.name, icon: values.icon, color: values.color },
        })
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
    <section className="flex flex-col gap-4 px-4 pt-12">
      <PageHeader title="Categorías" backTo="/mas" />
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
        <Card className="py-1">
          <ul className="divide-y divide-cream">
            {list.map((category) => (
              <li key={category.id}>
                <MovementRow
                  leading={<CategoryIconCircle iconName={category.icon} color={category.color} />}
                  title={category.name}
                  onPress={() => {
                    setSubmitError(null)
                    setEditing({ category })
                  }}
                  pressLabel={`Editar ${category.name}`}
                  onDelete={() => setArchiving(category)}
                  deleteLabel={`Archivar ${category.name}`}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button
        onClick={() => {
          setSubmitError(null)
          setEditing({})
        }}
      >
        <Plus aria-hidden="true" className="mr-2 size-5" strokeWidth={2.5} />
        Nueva categoría
      </Button>

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
            isSubmitting={create.isPending || update.isPending}
            submitError={submitError}
            onSubmit={(values) => void save(values)}
          />
        </BottomSheet>
      )}
      {archiving && (
        <ConfirmDialog
          title="¿Archivar esta categoría?"
          message={`"${archiving.name}" deja de aparecer para cargar movimientos nuevos. Los que ya cargaste se mantienen.`}
          confirmLabel="Archivar"
          isBusy={archive.isPending}
          onConfirm={() => void confirmArchive()}
          onCancel={() => setArchiving(null)}
        />
      )}
    </section>
  )
}
