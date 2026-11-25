import { Bell, Check, Copy, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { useFormatMoney } from '@/shared/ui/useFormatMoney'
import { todayIso } from '@/shared/lib/month'
import { copyText } from '@/shared/lib/share'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Avatar, Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useAuth } from '@/features/auth/api/authContext'
import { useToast } from '@/shared/ui/toastContext'
import { groupByDay, noticeDay, noticeStamp } from '@/features/notifications/domain/noticeDays'
import { useNoticeDeletion } from '@/features/notifications/ui/useNoticeDeletion'
import {
  useApproveJoinRequest,
  useRejectJoinRequest,
  useRespondInvitation,
} from '@/features/groups/api/useGroups'
import {
  useConfirmPayment,
  useMarkNoticesRead,
  useNotices,
  usePaymentReports,
  useRejectPayment,
  useReportPayment,
} from '../api/useDebts'
import { noticeText, type Notice } from '../domain/debts'
import { PaymentAccountSheet } from './PaymentAccountSheet'

const pill =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-extrabold disabled:opacity-60 [&>svg]:shrink-0'

/** The person's inbox for groups: reminders to pay, payments to confirm and the answers to their own. */
export function GroupNoticesPage() {
  const toast = useToast()
  const formatMoney = useFormatMoney()
  const notices = useNotices()
  const reports = usePaymentReports()
  const markRead = useMarkNoticesRead()
  const report = useReportPayment()
  const confirm = useConfirmPayment()
  const [confirming, setConfirming] = useState<string | null>(null)
  const reject = useRejectPayment()
  const approveJoin = useApproveJoinRequest()
  const rejectJoin = useRejectJoinRequest()
  const respondInvitation = useRespondInvitation()
  const [paying, setPaying] = useState<Notice | null>(null)
  const deletion = useNoticeDeletion()
  const [confirmingAll, setConfirmingAll] = useState(false)
  const today = todayIso()
  const { user } = useAuth()
  // A tapped push opens this tray with the notice it is about (?aviso=<id>): it is scrolled into view and highlighted.
  const target = useSearchParams()[0].get('aviso')
  const toConfirm = (reports.data ?? []).filter(
    (r) => r.status === 'reported' && r.toUserId === user?.id,
  ).length
  // What was unread when the page opened stays highlighted while the person reads it.
  const fresh = useRef<Set<string> | null>(null)
  if (fresh.current === null && notices.data) {
    fresh.current = new Set(notices.data.filter((n) => n.readAt === null).map((n) => n.id))
  }
  const hasUnread = (notices.data ?? []).some((n) => n.readAt === null)
  const { mutate: markAllRead } = markRead
  useEffect(() => {
    if (hasUnread) markAllRead()
  }, [hasUnread, markAllRead])

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast.show(done)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  // What the person deleted is gone (also on this device while the cleanup migration is not applied).
  const visible = (notices.data ?? []).filter((n) => !deletion.removed.has(`notice:${n.id}`))
  const days = groupByDay(visible, (n) => noticeDay(n.createdAt), today)

  async function removeNotices(list: Notice[]) {
    try {
      const { kept } = await deletion.remove(
        list.map((n) => ({ key: `notice:${n.id}`, source: 'notice' as const, kind: n.kind })),
      )
      if (kept > 0) {
        toast.show(
          kept === 1
            ? 'Queda 1 aviso que todavía necesita tu respuesta'
            : `Quedan ${kept} avisos que todavía necesitan tu respuesta`,
        )
      }
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  const openReport = (n: Notice) =>
    n.reportId
      ? (reports.data ?? []).find((r) => r.id === n.reportId && r.status === 'reported')
      : undefined

  return (
    <Page>
      <PageHeader title="Avisos de grupos" fallbackTo="/grupos" />
      {toConfirm > 0 && (
        <p
          role="status"
          className="rounded-[20px] bg-tint-gold px-4 py-3 text-[16px] font-extrabold leading-6 text-ink"
        >
          {toConfirm === 1
            ? 'Tenés un pago pendiente de confirmar'
            : `Tenés ${toConfirm} pagos pendientes de confirmar`}
        </p>
      )}
      {notices.isLoading ? (
        <div role="status" aria-label="Cargando avisos" className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : notices.isError ? (
        <EmptyState
          mascotUrl={mascotUrl}
          title="No pudimos cargar tus avisos"
          description="Revisá tu conexión y probá de nuevo."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          mascotUrl={mascotUrl}
          title="No tenés avisos"
          description="Cuando alguien te recuerde un pago o te avise que te pagó, lo ves acá."
        />
      ) : (
        <>
          {days.map((day) => (
            <section key={day.day} aria-label={day.label} className="flex flex-col gap-3">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {day.label}
              </h2>
              <ul className="flex flex-col gap-3">
                {day.items.map((n) => {
                  const open = openReport(n)
                  const hasTransfer = n.transferAlias || n.transferCbu
                  return (
                    <li
                      key={n.id}
                      id={`aviso-${n.id}`}
                      ref={
                        n.id === target
                          ? (el) => el?.scrollIntoView?.({ block: 'center' })
                          : undefined
                      }
                      className={cn(
                        'rounded-[24px] border bg-card p-4',
                        n.id === target
                          ? 'border-2 border-ink ring-2 ring-lime'
                          : fresh.current?.has(n.id)
                            ? 'border-ink'
                            : 'border-line',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={n.actorName} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-extrabold leading-6">{noticeText(n, formatMoney)}</p>
                          <p className="text-[13px] font-bold text-text-muted">
                            Grupo: {n.groupName}
                          </p>
                          <p className="flex items-center gap-2 text-[14px] text-text-muted">
                            {noticeStamp(n.createdAt, today)}
                            {fresh.current?.has(n.id) && (
                              <span className="rounded-full bg-tint-green px-2 py-0.5 text-[12px] font-extrabold text-ink">
                                Nuevo
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeNotices([n])}
                          disabled={deletion.isRemoving}
                          aria-label={`Eliminar aviso: ${noticeText(n, formatMoney)}`}
                          className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted disabled:opacity-50"
                        >
                          <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={2} />
                        </button>
                      </div>

                      {n.kind === 'debt_reminder' && hasTransfer && (
                        <div className="mt-3 rounded-[18px] bg-tint-green p-3 text-ink dark:bg-lime/15">
                          <p className="text-[14px] font-bold">
                            Podés transferir a {n.transferLabel ?? 'su cuenta'}:
                          </p>
                          {[
                            ['Alias', n.transferAlias],
                            ['CBU/CVU', n.transferCbu],
                          ]
                            .filter(([, value]) => value)
                            .map(([label, value]) => (
                              <div
                                key={label}
                                className="mt-1 flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0 break-all text-[16px] font-extrabold">
                                  {label}: {value}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Copiar ${label}`}
                                  onClick={() =>
                                    void copyText(value ?? '', toast, `${label} copiado`)
                                  }
                                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card"
                                >
                                  <Copy aria-hidden="true" className="size-4" />
                                </button>
                              </div>
                            ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {n.kind === 'debt_reminder' && (
                          <button
                            type="button"
                            onClick={() => setPaying(n)}
                            className={cn(pill, 'bg-lime')}
                          >
                            <Check aria-hidden="true" className="size-4" /> Ya pagué
                          </button>
                        )}
                        {n.kind === 'payment_reported' && open && (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirming(open.id)}
                              disabled={confirm.isPending}
                              className={cn(pill, 'bg-lime')}
                            >
                              <Check aria-hidden="true" className="size-4" /> Confirmar recepción
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void run(
                                  () => reject.mutateAsync(open.id),
                                  'Le avisamos que no lo recibiste',
                                )
                              }
                              disabled={reject.isPending}
                              className={cn(pill, 'border-2 border-line bg-card text-ink')}
                            >
                              No lo recibí
                            </button>
                          </>
                        )}
                        {n.kind === 'join_request' && n.requestId && (
                          <>
                            <button
                              type="button"
                              disabled={approveJoin.isPending || rejectJoin.isPending}
                              onClick={() =>
                                void run(
                                  () => approveJoin.mutateAsync(n.requestId as string),
                                  `${n.actorName} ya es parte del grupo`,
                                )
                              }
                              className={cn(pill, 'bg-lime')}
                            >
                              <Check aria-hidden="true" className="size-4" /> Aceptar
                            </button>
                            <button
                              type="button"
                              disabled={approveJoin.isPending || rejectJoin.isPending}
                              onClick={() =>
                                void run(
                                  () => rejectJoin.mutateAsync(n.requestId as string),
                                  'Rechazaste la solicitud',
                                )
                              }
                              className={cn(pill, 'border-2 border-line bg-card text-ink')}
                            >
                              No aceptar
                            </button>
                          </>
                        )}
                        {n.kind === 'group_invitation' && n.invitationId && (
                          <>
                            <button
                              type="button"
                              disabled={respondInvitation.isPending}
                              onClick={() =>
                                void run(
                                  () =>
                                    respondInvitation.mutateAsync({
                                      invitationId: n.invitationId as string,
                                      accept: true,
                                    }),
                                  `Ya sos parte de ${n.groupName}`,
                                )
                              }
                              className={cn(pill, 'bg-lime')}
                            >
                              <Check aria-hidden="true" className="size-4" /> Aceptar
                            </button>
                            <button
                              type="button"
                              disabled={respondInvitation.isPending}
                              onClick={() =>
                                void run(
                                  () =>
                                    respondInvitation.mutateAsync({
                                      invitationId: n.invitationId as string,
                                      accept: false,
                                    }),
                                  'Rechazaste la invitación',
                                )
                              }
                              className={cn(pill, 'border-2 border-line bg-card text-ink')}
                            >
                              No, gracias
                            </button>
                          </>
                        )}
                        {n.kind === 'recurring_due' && (
                          <Link
                            to={`/grupos/${n.groupId}/recurrentes`}
                            className={cn(pill, 'bg-lime')}
                          >
                            <Check aria-hidden="true" className="size-4" /> Revisar y registrar
                          </Link>
                        )}
                        {n.kind !== 'join_rejected' &&
                          n.kind !== 'group_invitation' &&
                          n.kind !== 'recurring_due' && (
                            <Link
                              to={`/grupos/${n.groupId}`}
                              className={cn(pill, 'border-2 border-line bg-card text-ink')}
                            >
                              <Bell aria-hidden="true" className="size-4" />{' '}
                              {n.kind === 'group_archived' ? 'Ver historial' : 'Abrir el grupo'}
                            </Link>
                          )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            className="min-h-11 w-full rounded-full text-[15px] font-extrabold text-expense"
          >
            Eliminar todas
          </button>
        </>
      )}
      {confirmingAll && (
        <ConfirmDialog
          title="¿Eliminar todos los avisos?"
          message="Se borran los avisos, no los gastos, pagos ni invitaciones que los originaron. Lo que todavía necesita tu respuesta se queda."
          confirmLabel="Eliminar todas"
          isBusy={deletion.isRemoving}
          onConfirm={() => {
            setConfirmingAll(false)
            void removeNotices(visible)
          }}
          onCancel={() => setConfirmingAll(false)}
        />
      )}

      {paying && (
        <PaymentAccountSheet
          title="¿Ya le pagaste?"
          description={`Le vamos a avisar a ${paying.actorName} que le transferiste ${formatMoney(paying.amountCents)}. Elegí de qué cuenta salió: se descuenta ahora de esa cuenta y queda en Movimientos. La deuda se salda cuando ${paying.actorName} confirme.`}
          confirmLabel="Sí, ya pagué"
          noneLabel="Avisar sin elegir cuenta"
          busy={report.isPending}
          onClose={() => setPaying(null)}
          onConfirm={(accountId) => {
            const notice = paying
            setPaying(null)
            void run(
              () =>
                report.mutateAsync({
                  groupId: notice.groupId,
                  creditorId: notice.actorId,
                  amountCents: notice.amountCents,
                  accountId,
                }),
              `Le avisamos a ${notice.actorName}`,
            )
          }}
        />
      )}
      {confirming && (
        <PaymentAccountSheet
          title="Confirmar recepción"
          description="Elegí en qué cuenta entró la plata. Se acredita ahora y queda en Movimientos."
          confirmLabel="Confirmar y registrar"
          busy={confirm.isPending}
          onClose={() => setConfirming(null)}
          onConfirm={(accountId) => {
            const reportId = confirming
            setConfirming(null)
            if (!accountId) return
            void run(async () => {
              const settled = await confirm.mutateAsync({ reportId, accountId })
              if (!settled) throw new Error('debt_already_settled')
            }, 'Listo, confirmaste el pago')
          }}
        />
      )}
    </Page>
  )
}
