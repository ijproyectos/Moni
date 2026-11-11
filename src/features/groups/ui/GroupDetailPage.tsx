import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  House,
  Plug,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { percentLabel, progress } from '@/features/goals/domain/goals'
import { useGoals } from '@/features/goals/mock/goalsStore'
import { FEATURES } from '@/shared/config/features'
import { formatMonthName, formatRelativeDay } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { useGoBack } from '@/shared/lib/useGoBack'
import { monthStart, todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { EmptyState } from '@/shared/ui/EmptyState'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Avatar, MoniGlyph, ProgressBar } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useGroupLedger } from '../api/useGroupLedger'
import { useNewMemberNotice } from '../api/useNewMemberNotice'
import { useGroupTrips } from '@/features/trips/api/useTrips'
import {
  useLeaveGroup,
  useSettlements,
  useVoidSettlement,
  useVoidSharedExpense,
} from '../api/useGroups'
import type { Settlement } from '../domain/group'
import { canVoidExpense, canRecordReceipt, canVoidSettlement } from '../domain/groupView'
import { balanceHeadline, reminderMessage, splitShortLabel } from '../domain/groupsOverview'
import { personName, type LedgerExpense } from '../domain/ledger'
import { expensePaidPhrase, settlementPhrase } from '../domain/phrases'
import { patchOverlay } from '../mock/overlayStore'
import type { GuestExpenseInput } from '../api/guestsRepository'
import {
  useCreateGuestExpense,
  useVoidGuestExpense,
  useVoidGuestSettlement,
} from '../api/useGroupGuests'
import { useGroupPhoto } from '../api/useGroupPhotos'
import { EditGroupSheet } from './EditGroupSheet'
import { GroupDetailHeader } from './GroupDetailHeader'
import { InvitePanel } from './InvitePanel'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'
import { expenseIcon } from './expenseIcon'
import { AvatarStack } from './groupVisuals'
import { GroupBalanceHero, GroupExpenseRows, GroupPaidCards, type GroupExpenseRowData } from './GroupDetailBlocks'
import { PhraseText } from './PhraseText'
import { ReceiptSheet } from './ReceiptSheet'
import { SettleUpSheet } from './SettleUpSheet'
import { SharedExpenseSheet } from './SharedExpenseSheet'

type Sheet =
  | { type: 'new' }
  | { type: 'detail'; id: string }
  | { type: 'edit'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'settle' }
  | { type: 'group' }
  | { type: 'leave' }
  | { type: 'invite' }
  | { type: 'remove-group' }
  | { type: 'void-settlement'; settlement: Settlement }
  | { type: 'void-guest-settlement'; id: string }
  | { type: 'receipt'; id: string }
  | null

const RECURRING_ICONS = { house: House, plug: Plug, refresh: RefreshCw }

// Screens 040 / 052 / 060 / 093 / 103 / 131 — grupo.
export function GroupDetailPage() {
  const { id: groupId } = useParams()
  const navigate = useNavigate()
  // Back to where the group was opened from (Grupos, Viajes…); Grupos only if there was nothing before.
  const goBack = useGoBack('/grupos')
  const toast = useToast()
  const data = useGroupLedger(groupId)
  useNewMemberNotice(groupId)
  // Real dates and budget of the group trip (Viajes), if the group has them.
  const groupTrip = (useGroupTrips().data ?? []).find((t) => t.groupId === groupId)
  const settlements = useSettlements(groupId)
  const templates = useCategoryTemplates()
  const voidExpense = useVoidSharedExpense()
  const voidSettlement = useVoidSettlement()
  const voidGuest = useVoidGuestExpense()
  const voidGuestSettlement = useVoidGuestSettlement()
  const photoUrl = useGroupPhoto(groupId)
  const createGuest = useCreateGuestExpense()
  const leaveGroup = useLeaveGroup()
  const goals = useGoals()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [undo, setUndo] = useState<GuestExpenseInput | null>(null)

  const { ledger, meId, overlay, name } = data
  const kind = data.group.data?.kind ?? 'amigos'
  const templateList = templates.data ?? []
  const month = monthStart(todayIso())
  const monthExpenses = useMemo(
    () => ledger.expenses.filter((e) => e.occurredOn >= month),
    [ledger.expenses, month],
  )
  const selected =
    sheet && 'id' in sheet ? ledger.expenses.find((e) => e.id === sheet.id) : undefined

  if (data.isLoading) {
    return (
      <div role="status" aria-label="Cargando grupo" className="flex flex-col gap-4 px-4 pt-14">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (data.isError || !data.group.data || !groupId || overlay.deleted) {
    return (
      <EmptyState
        className="pt-24"
        mascotUrl={mascotAlert}
        title={data.isError ? 'No pudimos cargar el grupo' : 'No encontramos este grupo'}
        description={
          data.isError
            ? 'Revisá tu conexión y probá de nuevo.'
            : 'Puede que ya no seas parte o que el link no sea correcto.'
        }
        action={<Button onClick={() => navigate('/grupos')}>Ir a Grupos</Button>}
      />
    )
  }

  const partner = kind === 'pareja' ? ledger.people.find((p) => !p.isMe) : undefined
  const myNet = ledger.myNetCents
  const myTransfers = ledger.transfers.filter((t) => t.fromUserId === meId || t.toUserId === meId)
  const headline = balanceHeadline({
    myNetCents: myNet,
    meId,
    people: ledger.people,
    transfers: ledger.transfers,
  })
  const otherPaid = partner
    ? (ledger.paid[partner.id] ?? 0)
    : Object.entries(ledger.paid).reduce((s, [id, c]) => (id === meId ? s : s + c), 0)
  const canRemind =
    typeof navigator !== 'undefined' && Boolean(navigator.share || navigator.clipboard)

  // Real mechanism: the native share sheet, or the message copied to the clipboard.
  async function remind() {
    const text = reminderMessage({
      debtorNames: headline.debtorNames,
      groupName: name,
      amountText: formatArs(myNet),
    })
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        toast.show('Mensaje copiado', { mascotUrl: mascotHappy })
      }
    } catch (e) {
      // The person closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        toast.show('No pudimos compartir el mensaje', { tone: 'error', mascotUrl: mascotAlert })
      }
    }
  }

  function expenseRow(e: LedgerExpense): GroupExpenseRowData {
    const payerId = e.payers[0]?.personId ?? ''
    const payer =
      e.payers.length > 1
        ? 'Pagaron varios'
        : expensePaidPhrase({ id: payerId, name: personName(ledger.people, payerId) }, meId).replace(
            /^Pagaste$/,
            'Pagaste vos',
          )
    const myShare = e.shares.find((s) => s.personId === meId)?.cents ?? 0
    const myPaid = e.payers.find((p) => p.personId === meId)?.cents ?? 0
    const delta = myPaid - myShare
    const split = splitShortLabel(e.methodLabel, e.shares.length)
    const debtor = e.shares.find((s) => s.personId !== meId)
    return {
      id: e.id,
      title: e.description,
      meta: `${payer} · ${split} · ${formatRelativeDay(e.occurredOn, todayIso()).toLowerCase()}`,
      amountCents: e.amountCents,
      balanceLabel:
        delta > 0
          ? e.shares.length === 2 && debtor
            ? `${personName(ledger.people, debtor.personId)} te debe`
            : 'Te deben'
          : delta < 0
            ? 'Le debés'
            : null,
      balanceCents: Math.abs(delta),
      balanceTone: delta > 0 ? 'owed' : delta < 0 ? 'owes' : null,
      icon: icon(e),
    }
  }
  const sharedGoal = goals.find(
    (g) =>
      g.shared && (g.shared.space === name || (kind === 'pareja' && g.shared.space === 'Nosotros')),
  )
  const canEdit = (e: LedgerExpense) =>
    e.source === 'sim' || Boolean(e.real && canVoidExpense(e.real, meId))
  const icon = (e: LedgerExpense) => expenseIcon(templateList, e.templateSlug)

  async function deleteExpense(expense: LedgerExpense) {
    try {
      if (expense.source === 'real') {
        await voidExpense.mutateAsync(expense.id)
        toast.show('Gasto eliminado', { mascotUrl: mascotHappy })
      } else {
        await voidGuest.mutateAsync(expense.id)
        setUndo(expense)
        toast.show('Gasto eliminado', { mascotUrl: mascotHappy })
      }
      setSheet(null)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  async function leave() {
    if (!groupId) return
    try {
      await leaveGroup.mutateAsync(groupId)
      toast.show('Saliste del grupo', { mascotUrl: mascotHappy })
      navigate('/grupos', { replace: true })
    } catch (e) {
      setSheet(null)
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  const deleteImpact = (e: LedgerExpense) => {
    const myShare = e.shares.find((s) => s.personId === meId)?.cents ?? 0
    const myPaid = e.payers.find((p) => p.personId === meId)?.cents ?? 0
    return [
      {
        label: 'Total del grupo',
        from: formatArs(ledger.totalCents),
        to: formatArs(ledger.totalCents - e.amountCents),
      },
      {
        label: 'Tu parte',
        from: formatArs(ledger.myShareCents),
        to: formatArs(ledger.myShareCents - myShare),
      },
      {
        label: 'Tu saldo',
        from: formatArs(myNet, { signed: true }),
        to: formatArs(myNet - myPaid + myShare, { signed: true }),
      },
    ]
  }

  return (
    <section className="flex flex-col gap-4 px-5 pb-6 pt-8">
      <GroupDetailHeader
        name={name}
        kind={kind}
        photoUrl={photoUrl}
        extra={kind === 'pareja' ? <AvatarStack people={ledger.people} size="md" /> : null}
        onBack={goBack}
        onInvite={() => setSheet({ type: 'invite' })}
        onOptions={() => setSheet({ type: 'group' })}
      />

      <GroupBalanceHero
        headline={headline}
        myNetCents={myNet}
        onSettle={() => setSheet({ type: 'settle' })}
        onRemind={canRemind && myNet > 0 ? () => void remind() : undefined}
      />

      <GroupPaidCards
        myPaidCents={ledger.paid[meId] ?? 0}
        otherPaidCents={otherPaid}
        otherName={partner?.name ?? null}
      />

      {groupTrip && (
        <div className="rounded-[22px] bg-card px-4 py-3">
          <ProgressBar value={ledger.totalCents / groupTrip.budgetCents} />
          <p className="mt-1 text-[13px] text-text-muted">
            Presupuesto del grupo {formatArs(groupTrip.budgetCents)} · gastaron el{' '}
            {Math.round((ledger.totalCents / groupTrip.budgetCents) * 100)}%
          </p>
        </div>
      )}

      {kind !== 'pareja' && ledger.transfers.length > 0 && (
        <section aria-label="Para quedar a mano" className="rounded-[26px] bg-card px-4 py-3">
          <p className="text-[13px] font-semibold text-text-muted">Para quedar a mano</p>
          <ul className="mt-2 flex flex-col gap-2">
            {ledger.transfers.map((t) => {
              const from = personName(ledger.people, t.fromUserId)
              const to = personName(ledger.people, t.toUserId)
              return (
                <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-3">
                  <AvatarStack people={[{ name: from }, { name: to }]} />
                  <span className="flex-1 text-[15px] font-medium">
                    {t.fromUserId === meId
                      ? `Vos le pasás a ${to}`
                      : t.toUserId === meId
                        ? `${from} te pasa`
                        : `${from} le pasa a ${to}`}
                  </span>
                  <AmountDisplay cents={t.amountCents} className="text-[15px] font-semibold" />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {FEATURES.sharedGoals && kind === 'pareja' && sharedGoal && (
        <Link
          to={`/metas/${sharedGoal.id}`}
          className="flex items-center gap-3 rounded-[22px] border border-line bg-card px-4 py-3"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-tint-red text-expense">
            <Heart aria-hidden="true" className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[18px] font-extrabold">{sharedGoal.name}</span>
            <ProgressBar value={progress(sharedGoal)} className="mt-1.5" />
          </span>
          <span className="text-[18px] font-extrabold">{percentLabel(progress(sharedGoal))}</span>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      )}

      {FEATURES.aguinaldo && kind === 'viaje' && myNet < 0 && (
        <div className="flex items-center gap-3 rounded-[22px] bg-tint-green px-4 py-3">
          <MoniGlyph />
          <p className="flex-1 text-[16px] leading-5">
            <strong className="font-extrabold">Con el aguinaldo:</strong> tu parte (
            {formatArs(ledger.myShareCents)}) se puede reservar.
          </p>
          <Link
            to="/aguinaldo"
            className="rounded-full bg-forest px-4 py-2 text-[15px] font-extrabold text-cream"
          >
            Reservar
          </Link>
        </div>
      )}

      {kind === 'casa' && overlay.recurring.some((r) => r.enabled) && (
        <section className="rounded-[24px] border border-line bg-card px-4 py-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
            Se repiten cada mes
          </p>
          <ul className="mt-1 divide-y divide-line">
            {overlay.recurring
              .filter((r) => r.enabled)
              .map((r) => {
                const Icon = RECURRING_ICONS[r.icon]
                const loaded = monthExpenses.some((e) =>
                  e.description
                    .toLowerCase()
                    .includes(r.name.toLowerCase().split(' ')[0] ?? r.name),
                )
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <span className="flex size-11 items-center justify-center rounded-full bg-lime/35">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[17px] font-extrabold">{r.name}</span>
                      <span className="block text-[14px] text-text-muted">
                        {loaded ? `Se carga el ${r.day} · ya está` : `Vence el ${r.day}`}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-3 py-0.5 text-[13px] font-extrabold',
                        loaded ? 'bg-tint-green' : 'bg-sand',
                      )}
                    >
                      {loaded ? 'Cargado' : 'Pendiente'}
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-bold tracking-[-0.02em]">Gastos del grupo</h2>
        {kind === 'casa' || kind === 'pareja' ? (
          <span className="text-[13.5px] text-[#4F6157] dark:text-text-muted">
            {formatMonthName(month)}
          </span>
        ) : null}
        <Link
          to={`/grupos/${groupId}/personas`}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
        >
          <AvatarStack people={ledger.people} />
          {ledger.people.length} {ledger.people.length === 1 ? 'persona' : 'personas'}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <GroupExpenseRows
        rows={(kind === 'casa' || kind === 'pareja' ? monthExpenses : ledger.expenses).map(
          (e) => expenseRow(e),
        )}
        onOpen={(id) => setSheet({ type: 'detail', id })}
        empty="Todavía no hay gastos. Cargá el primero y Moni hace las cuentas."
      />

      {((settlements.data ?? []).filter((s) => s.status === 'posted').length > 0 ||
        overlay.settlements.length > 0) && (
        <section>
          <h2 className="px-1 text-[18px] font-extrabold">Pagos registrados</h2>
          <ul className="mt-2 divide-y divide-line rounded-[24px] border border-line bg-card">
            {(settlements.data ?? [])
              .filter((s) => s.status === 'posted')
              .map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                  <Avatar name={personName(ledger.people, s.fromUser)} size="sm" />
                  <span className="min-w-[9rem] flex-1 text-[16px]">
                    <PhraseText
                      segments={settlementPhrase(
                        { id: s.fromUser, name: personName(ledger.people, s.fromUser) },
                        { id: s.toUser, name: personName(ledger.people, s.toUser) },
                        meId,
                      )}
                    />
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[16px] font-extrabold">{formatArs(s.amountCents)}</span>
                    {canRecordReceipt(s, meId) && (
                      <button
                        type="button"
                        onClick={() => setSheet({ type: 'receipt', id: s.id })}
                        className="inline-flex min-h-11 items-center text-[14px] font-extrabold underline"
                      >
                        Anotar
                      </button>
                    )}
                    {canVoidSettlement(s, meId) && (
                      <button
                        type="button"
                        aria-label="Anular pago"
                        onClick={() => setSheet({ type: 'void-settlement', settlement: s })}
                        className="flex size-11 shrink-0 items-center justify-center text-text-muted"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            {overlay.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                <Avatar name={personName(ledger.people, s.fromId)} size="sm" />
                <span className="min-w-[9rem] flex-1 text-[16px]">
                  <PhraseText
                    segments={settlementPhrase(
                      { id: s.fromId, name: personName(ledger.people, s.fromId) },
                      { id: s.toId, name: personName(ledger.people, s.toId) },
                      meId,
                    )}
                  />
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-[16px] font-extrabold">{formatArs(s.cents)}</span>
                  <button
                    type="button"
                    aria-label="Anular pago"
                    onClick={() => setSheet({ type: 'void-guest-settlement', id: s.id })}
                    className="flex size-11 shrink-0 items-center justify-center text-text-muted"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="h-20" aria-hidden="true" />
      {undo && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-full max-w-[398px] items-center gap-3 rounded-full bg-forest py-2 pl-5 pr-2 text-cream shadow-lg">
          <Check aria-hidden="true" className="size-5 text-cream" />
          <span className="flex-1 text-[16px] font-extrabold">Gasto eliminado</span>
          <button
            type="button"
            onClick={() => {
              const back = undo
              setUndo(null)
              createGuest
                .mutateAsync({ groupId, expense: back })
                .catch((e) =>
                  toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert }),
                )
            }}
            className="rounded-full bg-forest px-4 py-2 text-[15px] font-extrabold text-cream dark:bg-lime dark:text-on-bright"
          >
            Deshacer
          </button>
        </div>
      )}
      <div
        data-bottom-action
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] gap-2 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4"
      >
        <Button
          className="flex-[1.3] whitespace-nowrap px-3 max-[359px]:text-[16px]"
          onClick={() => setSheet({ type: 'new' })}
        >
          <Plus aria-hidden="true" className="mr-2 size-5" strokeWidth={2.5} /> Agregar gasto
        </Button>
        {kind === 'casa' ? (
          <Button
            variant="ghost"
            className="h-14 flex-1 whitespace-nowrap rounded-full border-2 border-line bg-card px-3 text-ink max-[359px]:text-[16px]"
            onClick={() => setSheet({ type: 'settle' })}
          >
            <Check aria-hidden="true" className="mr-2 size-5" /> Saldar
          </Button>
        ) : kind !== 'pareja' ? (
          <Link
            to={`/grupos/${groupId}/resumen`}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-line bg-card text-[18px] font-extrabold"
          >
            <Upload aria-hidden="true" className="size-5" /> Resumen
          </Link>
        ) : null}
      </div>

      {sheet?.type === 'new' && (
        <SharedExpenseSheet groupId={groupId} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'detail' && selected && (
        <ExpenseDetailSheet
          expense={selected}
          people={ledger.people}
          icon={icon(selected)}
          canEdit={canEdit(selected)}
          onEdit={() => setSheet({ type: 'edit', id: selected.id })}
          onDelete={() => setSheet({ type: 'delete', id: selected.id })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'edit' && selected && (
        <SharedExpenseSheet
          groupId={groupId}
          editing={selected}
          onDelete={() => setSheet({ type: 'delete', id: selected.id })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'delete' && selected && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title={`¿Eliminar “${selected.description}”?`}
          changes={deleteImpact(selected)}
          onClose={() => setSheet(null)}
          actions={[
            {
              label: 'Sí, eliminar',
              tone: 'danger',
              onClick: () => void deleteExpense(selected),
              disabled: voidExpense.isPending,
            },
            { label: 'Mejor no', tone: 'outline', onClick: () => setSheet(null) },
          ]}
        >
          Se saca de las cuentas del grupo y Moni recalcula quién le debe a quién.
        </DecisionSheet>
      )}
      {sheet?.type === 'invite' && (
        <BottomSheet title="Invitar al grupo" onClose={() => setSheet(null)}>
          <InvitePanel groupId={groupId} groupName={name} />
        </BottomSheet>
      )}
      {sheet?.type === 'settle' && (
        <SettleUpSheet
          groupId={groupId}
          meId={meId}
          people={ledger.people}
          transfers={myTransfers.length ? myTransfers : ledger.transfers}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'group' && (
        <EditGroupSheet
          groupId={groupId}
          kind={kind}
          name={name}
          people={ledger.people}
          overlay={overlay}
          onClose={() => setSheet(null)}
          onLeave={() => setSheet({ type: 'leave' })}
          onRemove={() => setSheet({ type: 'remove-group' })}
        />
      )}
      {sheet?.type === 'leave' && (
        <DecisionSheet
          icon={<ChevronLeft className="size-6" />}
          iconTone="neutral"
          title={`¿Salir de “${name}”?`}
          onClose={() => setSheet(null)}
          actions={[
            { label: 'Quedarme', onClick: () => setSheet(null) },
            {
              label: 'Salir del grupo',
              tone: 'danger',
              onClick: () => void leave(),
              disabled: leaveGroup.isPending || myNet !== 0,
            },
          ]}
        >
          <p>Dejás de ver el grupo y de recibir avisos. Los demás siguen con sus cuentas.</p>
          {myNet !== 0 && (
            <p className="mt-3 flex gap-2 rounded-[18px] bg-tint-green px-4 py-3 text-[16px]">
              <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {myNet < 0
                ? `Antes de irte tenés que saldar los ${formatArs(-myNet)} que debés.`
                : `Antes de irte, que te paguen los ${formatArs(myNet)} que te deben.`}
            </p>
          )}
        </DecisionSheet>
      )}
      {sheet?.type === 'remove-group' && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title={`¿Eliminar “${name}”?`}
          onClose={() => setSheet(null)}
          actions={[
            ...(myNet !== 0
              ? [{ label: 'Saldar primero', onClick: () => setSheet({ type: 'settle' }) }]
              : []),
            {
              label: myNet !== 0 ? 'Eliminar igual' : 'Eliminar grupo',
              tone: 'danger' as const,
              onClick: () => {
                patchOverlay(groupId, { deleted: true })
                toast.show('Grupo eliminado')
                navigate('/grupos', { replace: true })
              },
            },
            { label: 'Cancelar', tone: 'outline' as const, onClick: () => setSheet(null) },
          ]}
        >
          <p>Se borran los gastos del grupo para todos.</p>
          {myNet !== 0 && (
            <p className="mt-3 rounded-[18px] bg-tint-gold px-4 py-3 text-[16px]">
              <strong className="font-extrabold">
                {myNet < 0 ? `Debés ${formatArs(-myNet)}.` : `Te deben ${formatArs(myNet)}.`}
              </strong>{' '}
              Si lo eliminás, esa cuenta se pierde.
            </p>
          )}
        </DecisionSheet>
      )}
      {sheet?.type === 'void-settlement' && (
        <ConfirmDialog
          title="¿Anular este pago?"
          message="Los saldos vuelven a como estaban antes del pago, y se devuelve la plata de las cuentas que lo registraron."
          confirmLabel="Anular pago"
          isBusy={voidSettlement.isPending}
          onConfirm={() =>
            void voidSettlement
              .mutateAsync(sheet.settlement.id)
              .then(() => toast.show('Pago anulado', { mascotUrl: mascotHappy }))
              .catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error' }))
              .finally(() => setSheet(null))
          }
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'void-guest-settlement' && (
        <ConfirmDialog
          title="¿Anular este pago?"
          message="Los saldos del grupo vuelven a como estaban antes del pago. Si lo anotaste en una de tus cuentas, esa plata se devuelve una sola vez."
          confirmLabel="Anular pago"
          isBusy={voidGuestSettlement.isPending}
          onConfirm={() =>
            void voidGuestSettlement
              .mutateAsync(sheet.id)
              .then(() => toast.show('Pago anulado', { mascotUrl: mascotHappy }))
              .catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error' }))
              .finally(() => setSheet(null))
          }
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'receipt' && (
        <ReceiptSheet settlementId={sheet.id} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}
