import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useAuth } from '@/features/auth/api/authContext'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useCreateSharedExpense,
  useGroup,
  useGroupMembers,
  useVoidSharedExpense,
} from '../api/useGroups'
import type { SharedExpenseFormValues } from '../domain/group'
import { activeMembers } from '../domain/groupView'
import type { LedgerExpense } from '../domain/ledger'
import { addSimExpense, removeSimExpense, useOverlay } from '../mock/overlayStore'
import { SharedExpenseForm, type SimulatedExpenseInput } from './SharedExpenseForm'

interface SharedExpenseSheetProps {
  groupId: string
  onClose: () => void
  /** Edit mode (screen 091): the old expense is replaced by the new one. */
  editing?: LedgerExpense
  onDelete?: () => void
}

/** Nuevo / Editar gasto sheet: real expenses go to Supabase, new features stay in memory. */
export function SharedExpenseSheet({
  groupId,
  onClose,
  editing,
  onDelete,
}: SharedExpenseSheetProps) {
  const { user } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const group = useGroup(groupId)
  const membersQuery = useGroupMembers(groupId)
  const templatesQuery = useCategoryTemplates()
  const accountsQuery = useAccounts()
  const overlay = useOverlay(groupId)
  const create = useCreateSharedExpense()
  const voidExpense = useVoidSharedExpense()
  const toast = useToast()

  const members = useMemo(() => activeMembers(membersQuery.data ?? []), [membersQuery.data])
  const templates = useMemo(
    () => (templatesQuery.data ?? []).filter((t) => t.kind === 'expense'),
    [templatesQuery.data],
  )

  const isLoading = membersQuery.isLoading || accountsQuery.isLoading || templatesQuery.isLoading
  const loadFailed = membersQuery.isError || accountsQuery.isError || templatesQuery.isError

  async function removeOld() {
    if (!editing) return
    if (editing.source === 'real') await voidExpense.mutateAsync(editing.id)
    else removeSimExpense(groupId, editing.id)
  }

  async function submit(values: SharedExpenseFormValues) {
    setSubmitError(null)
    try {
      await removeOld()
      await create.mutateAsync({ groupId, values })
      toast.show(editing ? 'Gasto actualizado' : 'Gasto guardado', { mascotUrl: mascotGroup })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  async function submitSimulated(expense: SimulatedExpenseInput) {
    setSubmitError(null)
    try {
      await removeOld()
      addSimExpense(groupId, expense)
      toast.show(editing ? 'Gasto actualizado' : 'Gasto guardado', { mascotUrl: mascotGroup })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title={editing ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      {isLoading ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-14 rounded-full" />
          <Skeleton className="h-32" />
        </div>
      ) : loadFailed || !user ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
          <img src={mascotAlert} alt="" className="size-24" />
          <p className="text-text-muted">No pudimos cargar el grupo. Probá de nuevo en un rato.</p>
        </div>
      ) : (
        <SharedExpenseForm
          members={members}
          meId={user.id}
          templates={templates}
          accounts={accountsQuery.data ?? []}
          guests={overlay.guests}
          kind={group.data?.kind}
          incomeShare={overlay.coupleSplit === 'income' ? overlay.incomeShare : 0.5}
          isSubmitting={create.isPending || voidExpense.isPending}
          submitError={submitError}
          onSubmit={(values) => void submit(values)}
          onSubmitSimulated={(expense) => void submitSimulated(expense)}
          initial={editing}
          submitLabel={editing ? 'Guardar cambios' : 'Guardar gasto'}
          onDelete={onDelete}
        />
      )}
    </BottomSheet>
  )
}
