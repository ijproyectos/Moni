import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useAuth } from '@/features/auth/api/authContext'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { useCreateSharedExpense, useGroup, useGroupMembers, useMyGroups } from '../api/useGroups'
import type { SharedExpenseFormValues } from '../domain/group'
import { activeMembers } from '../domain/groupView'
import { SharedExpenseForm } from './SharedExpenseForm'
import { fieldClass, labelClass } from './styles'

/** What the new-movement sheet already has typed when the person marks the expense as shared. */
export interface SharedMovementDraft {
  amount: string
  note: string
  occurredOn: string
  accountId: string
  categoryName: string
}

interface SharedMovementFormProps {
  draft: SharedMovementDraft
  /** Closes the sheet after saving. */
  onSaved: () => void
  /** Closes the sheet when leaving for another screen. */
  onLeave: () => void
}

/**
 * "Compartido" section of the new-expense sheet: pick one of the person's real groups, then reuse
 * the shared-expense form (equal / percent split among real members) with the typed values.
 */
export function SharedMovementForm({ draft, onSaved, onLeave }: SharedMovementFormProps) {
  const groups = useMyGroups()
  const [groupId, setGroupId] = useState('')

  if (groups.isLoading) {
    return (
      <div role="status" aria-label="Cargando grupos" className="flex flex-col gap-3">
        <Skeleton className="h-14" />
      </div>
    )
  }
  if (groups.isError) {
    return (
      <p role="alert" className="py-4 text-center text-text-muted">
        No pudimos cargar tus grupos. Probá de nuevo en un rato.
      </p>
    )
  }
  const list = groups.data ?? []
  if (list.length === 0) {
    return (
      <p className="rounded-[18px] bg-sand px-4 py-4 text-center text-[16px] leading-6">
        Todavía no tenés grupos para compartir este gasto.{' '}
        <Link to="/grupos/nuevo" onClick={onLeave} className="font-extrabold text-ink underline">
          Crear grupo
        </Link>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Grupo</span>
        <select
          aria-label="Grupo"
          className={fieldClass}
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">Elegí un grupo</option>
          {list.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {groupId && (
        <GroupExpenseForm key={groupId} groupId={groupId} draft={draft} onSaved={onSaved} />
      )}
    </div>
  )
}

function GroupExpenseForm({
  groupId,
  draft,
  onSaved,
}: {
  groupId: string
  draft: SharedMovementDraft
  onSaved: () => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const group = useGroup(groupId)
  const membersQuery = useGroupMembers(groupId)
  const templatesQuery = useCategoryTemplates()
  const accountsQuery = useAccounts()
  const create = useCreateSharedExpense()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const members = useMemo(() => activeMembers(membersQuery.data ?? []), [membersQuery.data])
  const templates = useMemo(
    () => (templatesQuery.data ?? []).filter((t) => t.kind === 'expense'),
    [templatesQuery.data],
  )

  if (membersQuery.isLoading || accountsQuery.isLoading || templatesQuery.isLoading) {
    return (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (membersQuery.isError || accountsQuery.isError || templatesQuery.isError || !user) {
    return (
      <p role="alert" className="py-4 text-center text-text-muted">
        No pudimos cargar el grupo. Probá de nuevo en un rato.
      </p>
    )
  }

  // The person's categories are seeded from the templates, so the shared category is matched by name.
  const name = draft.categoryName.trim().toLowerCase()
  const templateSlug = templates.find((t) => t.name.trim().toLowerCase() === name)?.slug ?? null

  async function submit(values: SharedExpenseFormValues) {
    setSubmitError(null)
    try {
      await create.mutateAsync({ groupId, values })
      toast.show('Gasto compartido guardado', { mascotUrl: mascotGroup })
      onSaved()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  return (
    <SharedExpenseForm
      members={members}
      meId={user.id}
      templates={templates}
      accounts={accountsQuery.data ?? []}
      kind={group.data?.kind}
      isSubmitting={create.isPending}
      submitError={submitError}
      onSubmit={(values) => void submit(values)}
      defaults={{
        amount: draft.amount,
        description: draft.note.trim() || draft.categoryName,
        occurredOn: draft.occurredOn || undefined,
        templateSlug,
        payerAccountId: draft.accountId || null,
      }}
      submitLabel="Guardar gasto compartido"
    />
  )
}
