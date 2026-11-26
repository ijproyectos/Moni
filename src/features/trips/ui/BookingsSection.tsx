import { BedDouble, CalendarClock, ChevronDown, Link2, MoreHorizontal, Plane, Plus, Ticket, Users } from 'lucide-react'
import { useState } from 'react'
import type { Transaction } from '@/features/transactions/domain/transaction'
import { formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useToast } from '@/shared/ui/toastContext'
import { useFormatMoney } from '@/shared/ui/useFormatMoney'
import { nightsOf, subtypeLabel, type BookingKind } from '../domain/bookings'
import { daysBetween } from '../domain/dates'
import { moneyIn } from '../domain/money'
import type { BookingState } from '../domain/tripFinance'

const KIND_ICON: Record<BookingKind, typeof Plane> = { transport: Plane, lodging: BedDouble, other: Ticket }

export interface BookingActions {
  /** Pay (or, in a shared trip, load the shared expense that pays it). Hidden when not given. */
  pay?: (state: BookingState) => void
  edit: (state: BookingState) => void
  setCancelled: (state: BookingState, cancelled: boolean) => Promise<void>
  remove: (state: BookingState) => Promise<void>
  /** Opens the list of existing movements to attach one to the booking. Hidden when not given. */
  link?: (state: BookingState) => void
  /** Only the booking's owner (or a group administrator) manages a shared booking. */
  canManage?: (state: BookingState) => boolean
}

function deadlineNote(deadline: string | null, today: string): { text: string; urgent: boolean } | null {
  if (!deadline) return null
  const days = daysBetween(today, deadline) - 1
  if (days < 0) return { text: `Venció el ${formatDayMonth(deadline)}`, urgent: true }
  if (days === 0) return { text: 'Vence hoy', urgent: true }
  if (days === 1) return { text: 'Vence mañana', urgent: true }
  return { text: `Vence el ${formatDayMonth(deadline)}`, urgent: days <= 7 }
}

/**
 * «Mis reservas»: one compact card per booking with its total, what is paid and what is pending (never counted twice: the payments are the
 * expenses that point at it). Collapsible, and empty by default: a trip does not need any booking.
 */
export function BookingsSection({
  states,
  actions,
  onAdd,
  title = 'Mis reservas',
  defaultOpen = true,
  meId,
}: {
  states: readonly BookingState[]
  actions: BookingActions
  onAdd: () => void
  title?: string
  defaultOpen?: boolean
  meId?: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState(defaultOpen)
  const [menu, setMenu] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ type: 'cancel' | 'delete'; state: BookingState } | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayIso()
  const active = states.filter((s) => s.booking.status === 'active').length

  async function run(task: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await task()
      toast.show(done)
    } catch (e) {
      const message = toUserMessage(e)
      toast.show(
        message.includes('booking_has_payments') || message.includes('pagos') ? 'Esta reserva tiene pagos: cancelala, o eliminá primero esos gastos.' : message,
        { tone: 'error' },
      )
    }
    setBusy(false)
    setConfirm(null)
  }

  return (
    <section aria-label={title} className="rounded-[24px] border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-11 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown aria-hidden="true" className={`size-5 shrink-0 transition ${open ? '' : '-rotate-90'}`} />
          <span className="text-[20px] font-extrabold">{title}</span>
          {active > 0 && <span className="rounded-full bg-sand px-2 py-0.5 text-[13px] font-extrabold">{active}</span>}
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Agregar reserva"
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-sand px-3 text-[14px] font-extrabold"
        >
          <Plus aria-hidden="true" className="size-4" /> Reserva
        </button>
      </div>
      {open &&
        (states.length === 0 ? (
          <p className="mt-2 text-[15px] leading-5 text-text-muted">
            Pasajes, alojamiento, alquiler de auto, excursiones… Cargá lo que ya sepas: es opcional.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {states.map((state) => (
              <BookingCard
                key={state.booking.id}
                state={state}
                today={today}
                menuOpen={menu === state.booking.id}
                onMenu={() => setMenu(menu === state.booking.id ? null : state.booking.id)}
                actions={actions}
                meId={meId}
                onCancel={() => {
                  setMenu(null)
                  setConfirm({ type: 'cancel', state })
                }}
                onDelete={() => {
                  setMenu(null)
                  setConfirm({ type: 'delete', state })
                }}
                onRestore={() => void run(() => actions.setCancelled(state, false), 'Reserva reactivada')}
              />
            ))}
          </ul>
        ))}
      {confirm?.type === 'cancel' && (
        <ConfirmDialog
          title="¿Cancelar esta reserva?"
          message="Lo que falta pagar deja de contar en el presupuesto. Lo que ya pagaste sigue siendo un gasto del viaje."
          confirmLabel="Cancelar reserva"
          isBusy={busy}
          onConfirm={() => void run(() => actions.setCancelled(confirm.state, true), 'Reserva cancelada')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmDialog
          title="¿Eliminar esta reserva?"
          message="Solo se puede si no tiene pagos registrados. Si ya pagaste algo, cancelala."
          confirmLabel="Eliminar"
          isBusy={busy}
          onConfirm={() => void run(() => actions.remove(confirm.state), 'Reserva eliminada')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  )
}

function BookingCard({
  state,
  today,
  menuOpen,
  onMenu,
  actions,
  meId,
  onCancel,
  onDelete,
  onRestore,
}: {
  state: BookingState
  today: string
  menuOpen: boolean
  onMenu: () => void
  actions: BookingActions
  meId?: string
  onCancel: () => void
  onDelete: () => void
  onRestore: () => void
}) {
  const b = state.booking
  const Icon = KIND_ICON[b.kind]
  const cancelled = b.status === 'cancelled'
  const nights = b.kind === 'lodging' ? nightsOf(b.startsOn, b.endsOn) : null
  const deadline = !cancelled && state.pendingCents > 0 ? deadlineNote(b.payDeadline, today) : null
  const manage = actions.canManage ? actions.canManage(state) : true
  const detail = [
    subtypeLabel(b.kind, b.subtype),
    b.kind === 'transport' && b.origin && b.destination ? `${b.origin} → ${b.destination}` : null,
    b.kind === 'lodging' ? b.address : null,
    b.startsOn ? `${formatDayMonth(b.startsOn)}${b.endsOn ? ` – ${formatDayMonth(b.endsOn)}` : ''}` : null,
    nights !== null ? `${nights} ${nights === 1 ? 'noche' : 'noches'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const fully = !cancelled && state.pendingCents === 0
  return (
    <li className={`rounded-[18px] border border-line bg-canvas p-3 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint-green text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[17px] font-extrabold">{b.title}</span>
            {b.scope === 'shared' && (
              <span title="Reserva compartida" className="flex shrink-0 items-center gap-1 rounded-full bg-sand px-1.5 py-0.5 text-[11px] font-extrabold">
                <Users aria-hidden="true" className="size-3" /> Compartida
              </span>
            )}
            {cancelled && <span className="shrink-0 rounded-full bg-sand px-1.5 py-0.5 text-[11px] font-extrabold">Cancelada</span>}
          </span>
          <span className="block text-[13px] leading-5 text-text-muted">{detail}</span>
        </span>
        <button
          type="button"
          onClick={onMenu}
          aria-label={`Más opciones de ${b.title}`}
          aria-expanded={menuOpen}
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-text-muted">Total</dt>
          <dd className="font-extrabold">{moneyIn(b.totalCents, b.currency)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Pagado</dt>
          <dd className="font-extrabold">{moneyIn(state.paidCents, b.currency)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Pendiente</dt>
          <dd className={`font-extrabold ${state.pendingCents > 0 ? 'text-expense' : ''}`}>{moneyIn(state.pendingCents, b.currency)}</dd>
        </div>
      </dl>
      {b.scope === 'shared' && b.participants.length > 0 && meId && b.participants.includes(meId) && (
        <p className="mt-1 text-[13px] text-text-muted">Mi parte: {moneyIn(Math.round(b.totalCents / b.participants.length), b.currency)}</p>
      )}
      {state.unconverted && <p className="mt-1 text-[12.5px] text-text-muted">Algún pago está en otra moneda y no pudimos convertirlo: puede faltar.</p>}
      {state.overpaid && <p className="mt-1 text-[12.5px] font-bold text-expense">Pagaste más que el total de la reserva.</p>}
      {deadline && (
        <p className={`mt-1 flex items-center gap-1 text-[13px] font-extrabold ${deadline.urgent ? 'text-expense' : 'text-text-muted'}`}>
          <CalendarClock aria-hidden="true" className="size-4" /> {deadline.text}
        </p>
      )}
      {fully && <p className="mt-1 text-[13px] font-extrabold text-income">Pagada</p>}
      {!cancelled && actions.pay && state.pendingCents > 0 && (
        <button
          type="button"
          onClick={() => actions.pay?.(state)}
          aria-label={`Registrar un pago de ${b.title}`}
          className="mt-2 min-h-11 w-full rounded-full bg-forest text-[15px] font-extrabold text-cream dark:bg-lime dark:text-on-bright"
        >
          Registrar un pago
        </button>
      )}
      {menuOpen && (
        <div className="mt-2 flex flex-wrap gap-2">
          {manage && (
            <button type="button" onClick={() => actions.edit(state)} className="min-h-10 rounded-full border-2 border-line px-3 text-[13px] font-extrabold">
              Editar
            </button>
          )}
          {!cancelled && actions.link && (
            <button
              type="button"
              onClick={() => actions.link?.(state)}
              className="flex min-h-10 items-center gap-1 rounded-full border-2 border-line px-3 text-[13px] font-extrabold"
            >
              <Link2 aria-hidden="true" className="size-4" /> Vincular un gasto
            </button>
          )}
          {manage &&
            (cancelled ? (
              <button type="button" onClick={onRestore} className="min-h-10 rounded-full border-2 border-line px-3 text-[13px] font-extrabold">
                Reactivar
              </button>
            ) : (
              <button type="button" onClick={onCancel} className="min-h-10 rounded-full border-2 border-line px-3 text-[13px] font-extrabold">
                Cancelar reserva
              </button>
            ))}
          {manage && (
            <button type="button" onClick={onDelete} className="min-h-10 rounded-full border-2 border-line px-3 text-[13px] font-extrabold text-expense">
              Eliminar
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** Existing expenses that can be attached to a booking (so what was already loaded is not loaded twice). */
export function LinkExpenseSheet({
  candidates,
  bookingTitle,
  onPick,
  onClose,
}: {
  candidates: readonly Transaction[]
  bookingTitle: string
  onPick: (transaction: Transaction) => Promise<void>
  onClose: () => void
}) {
  const money = useFormatMoney()
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <BottomSheet title={`Vincular a ${bookingTitle}`} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="py-4 text-center text-[15px] text-text-muted">No hay gastos sueltos para vincular.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {candidates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(t.id)
                  try {
                    await onPick(t)
                  } finally {
                    setBusy(null)
                  }
                }}
                className="flex min-h-14 w-full items-center gap-3 text-left disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-extrabold">{t.note?.trim() || 'Gasto'}</span>
                  <span className="block text-[13px] text-text-muted">{formatDayMonth(t.occurredOn)}</span>
                </span>
                <span className="text-[16px] font-extrabold">{money(-t.amountCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  )
}
