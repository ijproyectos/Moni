import { Bell, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { cn } from '@/shared/ui/cn'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import type { CenterItem } from '../domain/centerItems'
import { groupByDay, noticeDay, noticeStamp } from '../domain/noticeDays'
import { useNotificationCenter } from './useNotificationCenter'

/** The small bell next to the name (Moni Plus only): how many notices are unread, and the center they open. */
export function PlusBell() {
  const [open, setOpen] = useState(false)
  const center = useNotificationCenter()
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={center.unread > 0 ? `Notificaciones, ${center.unread} sin leer` : 'Notificaciones'}
        aria-haspopup="dialog"
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-[#F1EEDD]"
      >
        <Bell aria-hidden="true" className="size-[18px]" strokeWidth={2.1} />
        {center.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-expense px-1 text-[10.5px] font-extrabold leading-4 text-white"
          >
            {center.unread > 9 ? '9+' : center.unread}
          </span>
        )}
      </button>
      {open && <NotificationCenterSheet center={center} onClose={() => setOpen(false)} />}
    </>
  )
}

function NotificationCenterSheet({
  center,
  onClose,
}: {
  center: ReturnType<typeof useNotificationCenter>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmingAll, setConfirmingAll] = useState(false)
  const today = todayIso()
  const groups = groupByDay(center.items, (i) => noticeDay(i.at, i.hasTime), today)

  async function remove(list: CenterItem[]) {
    try {
      const { kept } = await center.remove(list)
      if (kept > 0) {
        toast.show(
          kept === 1 ? 'Queda 1 aviso que todavía necesita tu respuesta' : `Quedan ${kept} avisos que todavía necesitan tu respuesta`,
        )
      }
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <BottomSheet title="Notificaciones" onClose={onClose}>
      {center.isLoading ? (
        <div role="status" aria-label="Cargando notificaciones" className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : center.items.length === 0 ? (
        <p className="py-6 text-center text-[16px] text-text-muted">No tenés notificaciones.</p>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.day} aria-label={group.label}>
              <h3 className="pb-1 pt-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{group.label}</h3>
              <ul className="flex flex-col divide-y divide-line">
                {group.items.map((item) => {
                  const unread = center.isUnread(item)
                  return (
                    <li key={item.key} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          center.markRead(item)
                          onClose()
                          navigate(item.to)
                        }}
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className={cn('size-2.5 shrink-0 rounded-full', unread ? 'bg-expense' : 'bg-transparent')}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[15px] leading-5', unread ? 'font-extrabold' : 'font-medium')}>
                            {item.text}
                            {unread && <span className="sr-only"> (sin leer)</span>}
                          </span>
                          <span className="block text-[12.5px] text-text-muted">{noticeStamp(item.at, today, item.hasTime)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove([item])}
                        disabled={center.isRemoving}
                        aria-label={`Eliminar notificación: ${item.text}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted disabled:opacity-50"
                      >
                        <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={2} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            {center.unread > 0 && (
              <button
                type="button"
                onClick={center.markAllRead}
                className="min-h-11 w-full rounded-full border-2 border-line text-[15px] font-extrabold"
              >
                Marcar todo como leído
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmingAll(true)}
              className="min-h-11 w-full rounded-full text-[15px] font-extrabold text-expense"
            >
              Eliminar todas
            </button>
          </div>
        </>
      )}
      {confirmingAll && (
        <ConfirmDialog
          title="¿Eliminar todas las notificaciones?"
          message="Se borran los avisos, no los gastos, pagos ni invitaciones que los originaron. Lo que todavía necesita tu respuesta se queda."
          confirmLabel="Eliminar todas"
          isBusy={center.isRemoving}
          onConfirm={() => {
            setConfirmingAll(false)
            void remove(center.items)
          }}
          onCancel={() => setConfirmingAll(false)}
        />
      )}
    </BottomSheet>
  )
}
