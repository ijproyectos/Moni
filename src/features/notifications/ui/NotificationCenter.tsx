import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { Skeleton } from '@/shared/ui/Skeleton'
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
          <ul className="flex flex-col divide-y divide-line">
            {center.items.map((item) => {
              const unread = center.isUnread(item)
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => {
                      center.markRead(item)
                      onClose()
                      navigate(item.to)
                    }}
                    className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={cn('size-2.5 shrink-0 rounded-full', unread ? 'bg-expense' : 'bg-transparent')}
                    />
                    <span className={cn('min-w-0 flex-1 text-[15px] leading-5', unread ? 'font-extrabold' : 'font-medium')}>
                      {item.text}
                      {unread && <span className="sr-only"> (sin leer)</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {center.unread > 0 && (
            <button
              type="button"
              onClick={center.markAllRead}
              className="mt-2 min-h-11 w-full rounded-full border-2 border-line text-[15px] font-extrabold"
            >
              Marcar todo como leído
            </button>
          )}
        </>
      )}
    </BottomSheet>
  )
}
