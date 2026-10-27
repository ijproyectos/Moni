import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useNavigate } from 'react-router'
import {
  useCreateInvite,
  useGroup,
  useGroupBalances,
  useGroupInvites,
  useGroupMembers,
  useLeaveGroup,
  useRevokeInvite,
  useSettlements,
  useSharedExpenses,
  useVoidSettlement,
  useVoidSharedExpense,
} from '../api/useGroups'
import type { GroupInvite, Settlement } from '../domain/group'
import { activeMembers, suggestTransfers } from '../domain/groupView'
import type { Transfer } from '../domain/split'
import { BalancesPanel } from './BalancesPanel'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'
import { ExpensesPanel } from './ExpensesPanel'
import { GroupDetailScreen, type GroupTab } from './GroupDetailScreen'
import { InviteSheet } from './InviteSheet'
import { MembersPanel } from './MembersPanel'
import { ReceiptSheet } from './ReceiptSheet'
import { SettleSheet } from './SettleSheet'
import { useSharedExpenseSheet } from './sharedExpenseSheetContext'

type Confirm =
  | { type: 'void-settlement'; settlement: Settlement }
  | { type: 'revoke'; invite: GroupInvite }
  | { type: 'leave' }

interface SettleState {
  toUser?: string
  amountCents?: number
}

/** /grupos/:id container: fetches, mutates and owns the sheets of the group screen. */
export function GroupDetailPage() {
  const { id: groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { openNewSharedExpense } = useSharedExpenseSheet()

  const [tab, setTab] = useState<GroupTab>('expenses')
  const [expenseId, setExpenseId] = useState<string | null>(null)
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const [settle, setSettle] = useState<SettleState | null>(null)
  const [receiptFor, setReceiptFor] = useState<string | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const group = useGroup(groupId)
  const members = useGroupMembers(groupId)
  const balances = useGroupBalances(groupId)
  const expenses = useSharedExpenses(groupId)
  const settlements = useSettlements(groupId)
  const invites = useGroupInvites(groupId)
  const templates = useCategoryTemplates()

  const voidExpense = useVoidSharedExpense()
  const voidSettlement = useVoidSettlement()
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()
  const leaveGroup = useLeaveGroup()

  const meId = user?.id ?? ''
  const memberList = useMemo(() => members.data ?? [], [members.data])
  const active = useMemo(() => activeMembers(memberList), [memberList])
  const transfers = useMemo(() => suggestTransfers(balances.data ?? []), [balances.data])
  const myNet = balances.data ? (balances.data.find((b) => b.userId === meId)?.netCents ?? 0) : null
  const selectedExpense = expenses.data?.find((e) => e.id === expenseId) ?? null

  function fail(e: unknown) {
    toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
  }

  if (group.isLoading || members.isLoading) {
    return (
      <div role="status" aria-label="Cargando grupo" className="flex flex-col gap-4 px-4 pt-12">
        <Skeleton className="h-12" />
        <Skeleton className="h-28" />
        <Skeleton className="h-12 rounded-full" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (group.isError || members.isError) {
    return (
      <EmptyState
        className="pt-24"
        mascotUrl={mascotAlert}
        title="No pudimos cargar el grupo"
        description="Revisá tu conexión y probá de nuevo."
        action={
          <Button
            onClick={() => {
              void group.refetch()
              void members.refetch()
            }}
          >
            Reintentar
          </Button>
        }
      />
    )
  }
  if (!group.data || !groupId) {
    return (
      <EmptyState
        className="pt-24"
        mascotUrl={mascotAlert}
        title="No encontramos este grupo"
        description="Puede que ya no seas parte o que el link no sea correcto."
        action={<Button onClick={() => navigate('/grupos')}>Ir a Grupos</Button>}
      />
    )
  }

  async function onVoidExpense() {
    if (!selectedExpense) return
    setExpenseError(null)
    try {
      await voidExpense.mutateAsync(selectedExpense.id)
      toast.show('Gasto anulado', { mascotUrl: mascotHappy })
      setExpenseId(null)
    } catch (e) {
      setExpenseError(toUserMessage(e))
    }
  }

  async function onInvite() {
    if (!groupId) return
    setInviteError(null)
    try {
      setInvite(await createInvite.mutateAsync(groupId))
    } catch (e) {
      setInviteError(toUserMessage(e))
    }
  }

  async function runConfirm() {
    if (!confirm || !groupId) return
    try {
      if (confirm.type === 'void-settlement') {
        await voidSettlement.mutateAsync(confirm.settlement.id)
        toast.show('Pago anulado', { mascotUrl: mascotHappy })
      } else if (confirm.type === 'revoke') {
        await revokeInvite.mutateAsync(confirm.invite.id)
        toast.show('Invitación anulada', { mascotUrl: mascotHappy })
      } else {
        await leaveGroup.mutateAsync(groupId)
        toast.show('Saliste del grupo', { mascotUrl: mascotHappy })
        navigate('/grupos', { replace: true })
      }
      setConfirm(null)
    } catch (e) {
      setConfirm(null)
      fail(e)
    }
  }

  const confirmCopy = {
    'void-settlement': {
      title: '¿Anular este pago?',
      message:
        'Los saldos vuelven a como estaban antes del pago, y se devuelve la plata de las cuentas que lo registraron.',
      label: 'Anular pago',
    },
    revoke: {
      title: '¿Anular la invitación?',
      message: 'Ese código deja de funcionar. Quien ya entró sigue en el grupo.',
      label: 'Anular invitación',
    },
    leave: {
      title: '¿Salir del grupo?',
      message: 'Dejás de ver los gastos nuevos. Tu historial y tus gastos pasados se mantienen.',
      label: 'Salir del grupo',
    },
  } as const
  const copy = confirm ? confirmCopy[confirm.type] : null

  const templateList = templates.data ?? []

  return (
    <>
      <GroupDetailScreen group={group.data} myNetCents={myNet} tab={tab} onTabChange={setTab}>
        {tab === 'expenses' &&
          (expenses.isLoading ? (
            <div role="status" aria-label="Cargando gastos">
              <Skeleton className="h-48" />
            </div>
          ) : expenses.isError ? (
            <p role="alert" className="py-6 text-center text-text-muted">
              No pudimos cargar los gastos. Probá de nuevo en un rato.
            </p>
          ) : (
            <ExpensesPanel
              expenses={expenses.data ?? []}
              members={memberList}
              templates={templateList}
              meId={meId}
              onOpen={(expense) => {
                setExpenseError(null)
                setExpenseId(expense.id)
              }}
              onNew={() => openNewSharedExpense(groupId)}
            />
          ))}

        {tab === 'balances' &&
          (balances.isLoading ? (
            <div role="status" aria-label="Cargando saldos">
              <Skeleton className="h-48" />
            </div>
          ) : balances.isError || !balances.data ? (
            <p role="alert" className="py-6 text-center text-text-muted">
              No pudimos cargar los saldos. Probá de nuevo en un rato.
            </p>
          ) : (
            <BalancesPanel
              balances={balances.data}
              members={memberList}
              transfers={transfers}
              settlements={settlements.data ?? []}
              meId={meId}
              onSettle={(t: Transfer) =>
                setSettle({ toUser: t.toUserId, amountCents: t.amountCents })
              }
              onVoidSettlement={(settlement) => setConfirm({ type: 'void-settlement', settlement })}
              onRecordReceipt={(settlement) => setReceiptFor(settlement.id)}
            />
          ))}

        {tab === 'members' && (
          <MembersPanel
            members={active}
            invites={invites.data ?? []}
            invitesFailed={invites.isError}
            meId={meId}
            myNetCents={myNet}
            isInviting={createInvite.isPending}
            inviteError={inviteError}
            onInvite={() => void onInvite()}
            onShowInvite={(i) => setInvite(i.code)}
            onRevokeInvite={(i) => setConfirm({ type: 'revoke', invite: i })}
            onLeave={() => setConfirm({ type: 'leave' })}
          />
        )}
      </GroupDetailScreen>

      {selectedExpense && (
        <ExpenseDetailSheet
          expense={selectedExpense}
          members={memberList}
          template={templateList.find((t) => t.slug === selectedExpense.templateSlug)}
          meId={meId}
          isVoiding={voidExpense.isPending}
          voidError={expenseError}
          onVoid={() => void onVoidExpense()}
          onClose={() => setExpenseId(null)}
        />
      )}
      {settle && (
        <SettleSheet
          groupId={groupId}
          recipients={active.filter((m) => m.userId !== meId)}
          initialToUser={settle.toUser}
          initialAmountCents={settle.amountCents}
          onClose={() => setSettle(null)}
        />
      )}
      {receiptFor && <ReceiptSheet settlementId={receiptFor} onClose={() => setReceiptFor(null)} />}
      {invite && (
        <InviteSheet code={invite} groupName={group.data.name} onClose={() => setInvite(null)} />
      )}
      {confirm && copy && (
        <ConfirmDialog
          title={copy.title}
          message={copy.message}
          confirmLabel={copy.label}
          isBusy={voidSettlement.isPending || revokeInvite.isPending || leaveGroup.isPending}
          onConfirm={() => void runConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
