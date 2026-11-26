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
import { useCreateGuestExpense, useGroupOverlay } from '../api/useGroupGuests'
import { useFundSharedPaymentFromSavings, useLinkSharedExpenseToBooking, useMyGroupFunding } from '@/features/trips/api/useTrips'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { useCreateSharedExpense, useGroup, useGroupMembers } from '../api/useGroups'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import { ConvertToPersonalSheet } from './ConvertToPersonalSheet'
import type { SharedExpenseFormValues } from '../domain/group'
import { activeMembers } from '../domain/groupView'
import type { LedgerExpense } from '../domain/ledger'
import { SharedExpenseForm, type SimulatedExpenseInput } from './SharedExpenseForm'

interface SharedExpenseSheetProps {
  groupId: string
  onClose: () => void
  /** Edit mode (screen 091): the old expense is replaced by the new one. */
  editing?: LedgerExpense
  onDelete?: () => void
  /** A payment of a shared booking of the trip: the expense is linked to it (never counted twice) and starts with what is pending. */
  booking?: { id: string; title: string; pendingCents: number }
}

/** Nuevo / Editar gasto sheet: expenses between members and expenses that involve people without an account. */
export function SharedExpenseSheet({
  groupId,
  onClose,
  editing,
  onDelete,
  booking,
}: SharedExpenseSheetProps) {
  const { user } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const group = useGroup(groupId)
  const membersQuery = useGroupMembers(groupId)
  const templatesQuery = useCategoryTemplates()
  const accountsQuery = useAccounts()
  const overlay = useGroupOverlay(groupId)
  const create = useCreateSharedExpense()
  const createGuest = useCreateGuestExpense()
  // Editing: the account the expense was paid from, so saving does not silently stop charging it.
  const transactionsQuery = useTransactions()
  const [converting, setConverting] = useState(false)
  // My PRIVATE default origin of the money for this trip (nobody else can read it).
  const funding = useMyGroupFunding(groupId).data ?? null
  const linkBooking = useLinkSharedExpenseToBooking()
  const fundFromSavings = useFundSharedPaymentFromSavings()
  const toast = useToast()

  const members = useMemo(() => activeMembers(membersQuery.data ?? []), [membersQuery.data])
  const templates = useMemo(
    () => (templatesQuery.data ?? []).filter((t) => t.kind === 'expense'),
    [templatesQuery.data],
  )

  const isLoading =
    membersQuery.isLoading ||
    accountsQuery.isLoading ||
    templatesQuery.isLoading ||
    Boolean(editing && transactionsQuery.isLoading)
  const loadFailed = membersQuery.isError || accountsQuery.isError || templatesQuery.isError

  // The old expense is retired by the same server step that creates the new one: all or nothing, charged once.
  const replaces = editing
    ? { kind: editing.source === 'real' ? ('shared' as const) : ('guest' as const), id: editing.id }
    : undefined
  const paymentOf = editing
    ? (transactionsQuery.data ?? []).find((t) =>
        editing.source === 'real'
          ? t.sharedExpenseId === editing.id
          : t.guestExpenseId === editing.id,
      )
    : undefined
  const iPaid =
    Boolean(editing) && editing?.payers.length === 1 && editing.payers[0]?.personId === user?.id

  async function submit(values: SharedExpenseFormValues) {
    setSubmitError(null)
    try {
      const expenseId = await create.mutateAsync({ groupId, values, replaces })
      if (!editing && expenseId) {
        // Both steps are best effort after the expense exists: a failure never loses the expense, it only leaves it unlinked / unfunded.
        if (booking) await linkBooking.mutateAsync({ expenseId, bookingId: booking.id }).catch(() => undefined)
        if (funding?.source === 'savings' && values.payerAccountId && values.payerAccountId === funding.accountId) {
          await fundFromSavings.mutateAsync(expenseId).catch(() => undefined)
        }
      }
      toast.show(editing ? 'Gasto actualizado' : booking ? 'Pago registrado' : 'Gasto guardado', { mascotUrl: mascotGroup })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  async function submitSimulated(expense: SimulatedExpenseInput) {
    setSubmitError(null)
    try {
      await createGuest.mutateAsync({ groupId, expense, replaces })
      toast.show(editing ? 'Gasto actualizado' : 'Gasto guardado', { mascotUrl: mascotGroup })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  if (converting && editing) {
    return (
      <ConvertToPersonalSheet
        expense={editing}
        defaultAccountId={paymentOf?.accountId ?? null}
        onClose={() => setConverting(false)}
        onDone={onClose}
      />
    )
  }

  return (
    <BottomSheet
      title={editing ? 'Editar gasto' : 'Dividir gasto'}
      subtitle={overlay.name ?? group.data?.name}
      variant="screen"
      onClose={onClose}
    >
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
          isSubmitting={create.isPending || createGuest.isPending}
          submitError={submitError}
          onSubmit={(values) => void submit(values)}
          onSubmitSimulated={(expense) => void submitSimulated(expense)}
          initial={editing}
          defaults={{
            payerAccountId: paymentOf?.accountId ?? (funding && funding.source !== 'external' ? funding.accountId : null),
            ...(booking && !editing
              ? { description: `Pago · ${booking.title}`, amount: booking.pendingCents > 0 ? formatAmountInput(booking.pendingCents) : '' }
              : {}),
          }}
          submitLabel={editing ? 'Guardar cambios' : 'Guardar en el grupo'}
          onDelete={onDelete}
        />
      )}
      {editing && iPaid && !isLoading && !loadFailed && (
        <button
          type="button"
          onClick={() => setConverting(true)}
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-full border-2 border-line bg-card px-4 text-[16px] font-extrabold text-ink"
        >
          Pasar a gasto individual
        </button>
      )}
    </BottomSheet>
  )
}
