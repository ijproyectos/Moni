import { Bell, Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { formatRelativeDay } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { copyText } from '@/shared/lib/share'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Avatar, Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useConfirmPayment,
  useMarkNoticesRead,
  useNotices,
  usePaymentReports,
  useRejectPayment,
  useReportPayment,
} from '../api/useDebts'
import { noticeText, type Notice } from '../domain/debts'

const pill =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-extrabold disabled:opacity-60 [&>svg]:shrink-0'

/** The person's inbox for groups: reminders to pay, payments to confirm and the answers to their own. */
export function GroupNoticesPage() {
  const toast = useToast()
  const notices = useNotices()
  const reports = usePaymentReports()
  const markRead = useMarkNoticesRead()
  const report = useReportPayment()
  const confirm = useConfirmPayment()
  const reject = useRejectPayment()
  const [paying, setPaying] = useState<Notice | null>(null)
  const today = todayIso()
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

  const openReport = (n: Notice) =>
    n.reportId
      ? (reports.data ?? []).find((r) => r.id === n.reportId && r.status === 'reported')
      : undefined

  return (
    <Page>
      <PageHeader title="Avisos de grupos" backTo="/grupos" />
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
      ) : (notices.data ?? []).length === 0 ? (
        <EmptyState
          mascotUrl={mascotUrl}
          title="No tenés avisos"
          description="Cuando alguien te recuerde un pago o te avise que te pagó, lo ves acá."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {(notices.data ?? []).map((n) => {
            const open = openReport(n)
            const hasTransfer = n.transferAlias || n.transferCbu
            return (
              <li
                key={n.id}
                className={cn(
                  'rounded-[24px] border bg-white p-4',
                  fresh.current?.has(n.id) ? 'border-forest' : 'border-sand',
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={n.actorName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-extrabold leading-6">{noticeText(n)}</p>
                    <p className="text-[14px] text-text-muted">
                      {formatRelativeDay(n.createdAt.slice(0, 10), today)}
                    </p>
                  </div>
                </div>

                {n.kind === 'debt_reminder' && hasTransfer && (
                  <div className="mt-3 rounded-[18px] bg-lime/30 p-3">
                    <p className="text-[14px] font-bold">
                      Podés transferir a {n.transferLabel ?? 'su cuenta'}:
                    </p>
                    {[
                      ['Alias', n.transferAlias],
                      ['CBU/CVU', n.transferCbu],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="mt-1 flex items-center justify-between gap-2">
                          <span className="min-w-0 break-all text-[16px] font-extrabold">
                            {label}: {value}
                          </span>
                          <button
                            type="button"
                            aria-label={`Copiar ${label}`}
                            onClick={() => void copyText(value ?? '', toast, `${label} copiado`)}
                            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white"
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
                        onClick={() =>
                          void run(async () => {
                            const settled = await confirm.mutateAsync(open.id)
                            if (!settled) throw new Error('debt_already_settled')
                          }, 'Listo, confirmaste el pago')
                        }
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
                        className={cn(pill, 'border-2 border-sand bg-white')}
                      >
                        No lo recibí
                      </button>
                    </>
                  )}
                  <Link
                    to={`/grupos/${n.groupId}`}
                    className={cn(pill, 'border-2 border-sand bg-white')}
                  >
                    <Bell aria-hidden="true" className="size-4" /> Abrir el grupo
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {paying && (
        <ConfirmDialog
          title="¿Ya le pagaste?"
          message={`Le vamos a avisar a ${paying.actorName} que le transferiste ${formatArs(paying.amountCents)}. La deuda se salda cuando ${paying.actorName} confirme que lo recibió.`}
          confirmLabel="Sí, ya pagué"
          cancelLabel="Todavía no"
          isBusy={report.isPending}
          onConfirm={() => {
            const notice = paying
            setPaying(null)
            void run(
              () =>
                report.mutateAsync({
                  groupId: notice.groupId,
                  creditorId: notice.actorId,
                  amountCents: notice.amountCents,
                }),
              `Le avisamos a ${notice.actorName}`,
            )
          }}
          onCancel={() => setPaying(null)}
        />
      )}
    </Page>
  )
}
