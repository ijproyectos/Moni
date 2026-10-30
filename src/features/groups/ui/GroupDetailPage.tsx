import {
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Heart,
  House,
  Plug,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { percentLabel, progress } from '@/features/goals/domain/goals'
import { useGoals } from '@/features/goals/mock/goalsStore'
import { FEATURES } from '@/shared/config/features'
import { formatMonthName } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { monthStart, todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { EmptyState } from '@/shared/ui/EmptyState'
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
import { personName, type LedgerExpense } from '../domain/ledger'
import {
  patchOverlay,
  removeSimExpense,
  restoreSimExpense,
  type SimExpense,
} from '../mock/overlayStore'
import { EditGroupSheet } from './EditGroupSheet'
import { InvitePanel } from './InvitePanel'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'
import { expenseIcon } from './expenseIcon'
import { AvatarStack } from './groupVisuals'
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
  | { type: 'receipt'; id: string }
  | null

const RECURRING_ICONS = { house: House, plug: Plug, refresh: RefreshCw }

// Screens 040 / 052 / 060 / 093 / 103 / 131 — grupo.
export function GroupDetailPage() {
  const { id: groupId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const data = useGroupLedger(groupId)
  useNewMemberNotice(groupId)
  // Real dates and budget of the group trip (Viajes), if the group has them.
  const groupTrip = (useGroupTrips().data ?? []).find((t) => t.groupId === groupId)
  const settlements = useSettlements(groupId)
  const templates = useCategoryTemplates()
  const voidExpense = useVoidSharedExpense()
  const voidSettlement = useVoidSettlement()
  const leaveGroup = useLeaveGroup()
  const goals = useGoals()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [undo, setUndo] = useState<SimExpense | null>(null)

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
  const badge =
    myNet > 0
      ? `Te deben ${formatArs(myNet)}`
      : myNet < 0
        ? `Debés ${formatArs(-myNet)}`
        : 'Estás al día'
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
        const removed = groupId ? removeSimExpense(groupId, expense.id) : undefined
        if (removed) setUndo(removed)
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
    <section className="flex flex-col gap-4 px-4 pb-6 pt-14">
      <div className="flex items-center gap-3">
        <Link
          to="/grupos"
          aria-label="Volver a Grupos"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-sand bg-card"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="min-w-0 truncate font-display text-[28px] font-extrabold leading-8">
          {name}
        </h1>
        {kind === 'pareja' && <AvatarStack people={ledger.people} size="md" />}
        <button
          type="button"
          aria-label="Invitar"
          onClick={() => setSheet({ type: 'invite' })}
          className="ml-auto flex size-12 shrink-0 items-center justify-center rounded-full border border-sand bg-card"
        >
          <UserPlus aria-hidden="true" className="size-6" />
        </button>
        <button
          type="button"
          aria-label="Opciones del grupo"
          onClick={() => setSheet({ type: 'group' })}
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-sand bg-card"
        >
          <Ellipsis aria-hidden="true" className="size-6" />
        </button>
      </div>

      {kind === 'pareja' ? (
        <section
          className="rounded-[28px] bg-forest p-5 text-cream"
          aria-label="Saldo de la pareja"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              {myNet > 0
                ? `${partner?.name ?? 'Tu pareja'} te debe`
                : myNet < 0
                  ? `Le debés a ${partner?.name ?? 'tu pareja'}`
                  : 'Están a mano'}
            </p>
            <span className="rounded-full bg-surface px-3 py-1 text-[14px] font-extrabold text-lime">
              {overlay.coupleSplit === 'income' ? 'Según ingresos' : 'Mitad y mitad'}
            </span>
          </div>
          <p
            className={cn(
              'font-display text-[48px] font-extrabold leading-[56px]',
              myNet >= 0 ? 'text-lime' : 'text-blush',
            )}
          >
            {formatArs(Math.abs(myNet))}
          </p>
          <p className="text-[16px] text-text-muted-on-dark">
            Gastos compartidos de {formatMonthName(month).toLowerCase()}:{' '}
            {formatArs(monthExpenses.reduce((s, e) => s + e.amountCents, 0))}
          </p>
          <Button
            className="mt-4"
            onClick={() => setSheet({ type: 'settle' })}
            disabled={myNet === 0}
          >
            <Check aria-hidden="true" className="mr-2 size-5" /> Saldar cuentas
          </Button>
        </section>
      ) : (
        <section className="rounded-[28px] bg-forest p-5 text-cream" aria-label="Total del grupo">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              Total del grupo
            </p>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-[14px] font-extrabold',
                myNet > 0 ? 'bg-lime text-forest' : 'bg-surface text-lime',
              )}
            >
              {badge}
            </span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[40px] font-extrabold leading-[50px]">
              {formatArs(ledger.totalCents)}
            </span>
            <span className="text-[16px] text-text-muted-on-dark">
              tu parte {formatArs(ledger.myShareCents)}
            </span>
          </p>
          {groupTrip && (
            <>
              <ProgressBar
                value={ledger.totalCents / groupTrip.budgetCents}
                tone="dark"
                className="mt-2"
              />
              <p className="mt-1 text-[14px] text-text-muted-on-dark">
                Presupuesto del grupo {formatArs(groupTrip.budgetCents)} · gastaron el{' '}
                {Math.round((ledger.totalCents / groupTrip.budgetCents) * 100)}%
              </p>
            </>
          )}
          {ledger.transfers.length > 0 && (
            <div className="mt-4 border-t border-white/15 pt-3">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
                Para quedar a mano
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {ledger.transfers.map((t) => {
                  const from = personName(ledger.people, t.fromUserId)
                  const to = personName(ledger.people, t.toUserId)
                  return (
                    <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-3">
                      <AvatarStack people={[{ name: from }, { name: to }]} />
                      <span className="flex-1 text-[17px] font-extrabold">
                        {t.fromUserId === meId
                          ? `Vos le pasás a ${to}`
                          : t.toUserId === meId
                            ? `${from} te pasa a vos`
                            : `${from} le pasa a ${to}`}
                      </span>
                      <span className="text-[19px] font-extrabold text-lime">
                        {formatArs(t.amountCents)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {FEATURES.sharedGoals && kind === 'pareja' && sharedGoal && (
        <Link
          to={`/metas/${sharedGoal.id}`}
          className="flex items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-blush/50 text-expense">
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
        <div className="flex items-center gap-3 rounded-[22px] bg-lime/30 px-4 py-3">
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
        <section className="rounded-[24px] border border-sand bg-card px-4 py-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
            Se repiten cada mes
          </p>
          <ul className="mt-1 divide-y divide-sand">
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
                        loaded ? 'bg-lime/40' : 'bg-sand',
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

      <div className="flex items-center justify-between px-1">
        <h2 className="whitespace-nowrap text-[21px] font-extrabold">
          {kind === 'casa' ? `Gastos de ${formatMonthName(month).toLowerCase()}` : 'Gastos'}
        </h2>
        {kind === 'pareja' ? (
          <span className="text-[15px] text-text-muted">
            {monthExpenses.length} gastos este mes
          </span>
        ) : (
          <Link
            to={`/grupos/${groupId}/personas`}
            className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-extrabold"
          >
            <AvatarStack people={ledger.people} />
            {ledger.people.length} {ledger.people.length === 1 ? 'persona' : 'personas'}
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        )}
      </div>

      {ledger.expenses.length === 0 ? (
        <p className="rounded-[24px] border border-sand bg-card p-5 text-center text-[16px] text-text-muted">
          Todavía no hay gastos. Cargá el primero y Moni hace las cuentas.
        </p>
      ) : (
        <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
          {(kind === 'casa' ? monthExpenses : ledger.expenses).map((e) => {
            const Icon = icon(e)
            const payerId = e.payers[0]?.personId ?? ''
            const payer =
              e.payers.length > 1
                ? 'Pagaron varios'
                : payerId === meId
                  ? 'Pagaste vos'
                  : `Pagó ${personName(ledger.people, payerId)}`
            const myShare = e.shares.find((s) => s.personId === meId)?.cents ?? 0
            const myPaid = e.payers.find((p) => p.personId === meId)?.cents ?? 0
            const coupleDelta = myPaid - myShare
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ type: 'detail', id: e.id })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-full',
                      coupleDelta < 0 && kind === 'pareja'
                        ? 'bg-blush/50 text-expense'
                        : 'bg-lime/35',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] font-extrabold">
                      {e.description}
                    </span>
                    <span
                      className={cn(
                        'block truncate text-text-muted',
                        kind === 'pareja' ? 'text-[14px]' : 'text-[15px]',
                      )}
                    >
                      {kind === 'pareja'
                        ? `${payer} · ${formatArs(e.amountCents)} · ${e.methodLabel.startsWith('entre') ? '50/50' : e.methodLabel}`
                        : `${payer} · ${e.methodLabel}`}
                    </span>
                  </span>
                  {kind === 'pareja' ? (
                    <span className="text-right">
                      <span
                        className={cn(
                          'block text-[18px] font-extrabold',
                          coupleDelta >= 0 ? 'text-income' : 'text-expense',
                        )}
                      >
                        {formatArs(coupleDelta, { signed: true })}
                      </span>
                      <span className="block text-[14px] text-text-muted">
                        {coupleDelta >= 0 ? 'te debe' : 'le debés'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-right">
                      <span className="block text-[18px] font-extrabold">
                        {formatArs(e.amountCents)}
                      </span>
                      <span className="block text-[14px] text-text-muted">
                        tu parte {formatArs(myShare)}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {(settlements.data ?? []).filter((s) => s.status === 'posted').length > 0 && (
        <section>
          <h2 className="px-1 text-[18px] font-extrabold">Pagos registrados</h2>
          <ul className="mt-2 divide-y divide-sand rounded-[24px] border border-sand bg-card">
            {(settlements.data ?? [])
              .filter((s) => s.status === 'posted')
              .map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={personName(ledger.people, s.fromUser)} size="sm" />
                  <span className="flex-1 text-[16px]">
                    <strong className="font-extrabold">
                      {personName(ledger.people, s.fromUser)}
                    </strong>{' '}
                    le pagó a{' '}
                    <strong className="font-extrabold">
                      {personName(ledger.people, s.toUser)}
                    </strong>
                  </span>
                  <span className="text-[16px] font-extrabold">{formatArs(s.amountCents)}</span>
                  {canRecordReceipt(s, meId) && (
                    <button
                      type="button"
                      onClick={() => setSheet({ type: 'receipt', id: s.id })}
                      className="text-[14px] font-extrabold underline"
                    >
                      Anotar
                    </button>
                  )}
                  {canVoidSettlement(s, meId) && (
                    <button
                      type="button"
                      aria-label="Anular pago"
                      onClick={() => setSheet({ type: 'void-settlement', settlement: s })}
                      className="p-1 text-text-muted"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="h-20" aria-hidden="true" />
      {undo && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-full max-w-[398px] items-center gap-3 rounded-full bg-forest py-2 pl-5 pr-2 text-cream shadow-lg">
          <Check aria-hidden="true" className="size-5 text-lime" />
          <span className="flex-1 text-[16px] font-extrabold">Gasto eliminado</span>
          <button
            type="button"
            onClick={() => {
              restoreSimExpense(groupId, undo)
              setUndo(null)
            }}
            className="rounded-full bg-lime px-4 py-2 text-[15px] font-extrabold text-forest"
          >
            Deshacer
          </button>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] gap-2 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">
        <Button className="flex-[1.3]" onClick={() => setSheet({ type: 'new' })}>
          <Plus aria-hidden="true" className="mr-2 size-5" strokeWidth={2.5} /> Agregar gasto
        </Button>
        {kind === 'casa' ? (
          <Button
            variant="ghost"
            className="h-14 flex-1 rounded-full border-2 border-sand bg-card text-ink"
            onClick={() => setSheet({ type: 'settle' })}
          >
            <Check aria-hidden="true" className="mr-2 size-5" /> Saldar
          </Button>
        ) : kind !== 'pareja' ? (
          <Link
            to={`/grupos/${groupId}/resumen`}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card text-[18px] font-extrabold"
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
            <p className="mt-3 flex gap-2 rounded-[18px] bg-lime/30 px-4 py-3 text-[16px]">
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
            <p className="mt-3 rounded-[18px] bg-gold/30 px-4 py-3 text-[16px]">
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
      {sheet?.type === 'receipt' && (
        <ReceiptSheet settlementId={sheet.id} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}
