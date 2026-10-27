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
import { useCreateSharedExpense, useGroupMembers } from '../api/useGroups'
import type { SharedExpenseFormValues } from '../domain/group'
import { activeMembers } from '../domain/groupView'
import { SharedExpenseForm } from './SharedExpenseForm'

interface SharedExpenseSheetProps {
  groupId: string
  onClose: () => void
}

/** "Nuevo gasto compartido" sheet container: loads members, templates and accounts. */
export function SharedExpenseSheet({ groupId, onClose }: SharedExpenseSheetProps) {
  const { user } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const membersQuery = useGroupMembers(groupId)
  const templatesQuery = useCategoryTemplates()
  const accountsQuery = useAccounts()
  const create = useCreateSharedExpense()
  const toast = useToast()

  const members = useMemo(() => activeMembers(membersQuery.data ?? []), [membersQuery.data])
  const templates = useMemo(
    () => (templatesQuery.data ?? []).filter((t) => t.kind === 'expense'),
    [templatesQuery.data],
  )

  const isLoading = membersQuery.isLoading || accountsQuery.isLoading || templatesQuery.isLoading
  const loadFailed = membersQuery.isError || accountsQuery.isError || templatesQuery.isError

  async function submit(values: SharedExpenseFormValues) {
    setSubmitError(null)
    try {
      await create.mutateAsync({ groupId, values })
      toast.show('Gasto compartido guardado', { mascotUrl: mascotGroup })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Nuevo gasto compartido" onClose={onClose}>
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
          isSubmitting={create.isPending}
          submitError={submitError}
          onSubmit={(values) => void submit(values)}
        />
      )}
    </BottomSheet>
  )
}
