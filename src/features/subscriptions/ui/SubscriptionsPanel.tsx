import { BellRing, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { formatCompactDate, formatRelativeDay } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { SectionLabel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useDismissDuplicate,
  useLinkChargeToExpense,
  useMarkChargeNotCharged,
  useSubscriptions,
} from '../api/useSubscriptions'
import {
  monthlyEstimateCents,
  needsAttention,
  remindersFor,
  upcomingCharges,
  withStatus,
  yearlyEstimateCents,
  type Subscription,
  type SubscriptionCharge,
} from '../domain/subscription'
import { ChargeRow } from './ChargeRow'
import { ServiceLogo } from './ServiceLogo'
import { SubscriptionDetailSheet } from './SubscriptionDetailSheet'
import { SubscriptionFormSheet } from './SubscriptionFormSheet'

const HISTORY_SHOWN = 12

/** Screen 074 — Suscripciones, saved in the database and charged by the server on their dates. */
export function SubscriptionsPanel({ onAdd }: { onAdd: () => void }) {
  const toast = useToast()
  const query = useSubscriptions()
  const notCharged = useMarkChargeNotCharged()
  const link = useLinkChargeToExpense()
  const dismiss = useDismissDuplicate()
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [reverting, setReverting] = useState<SubscriptionCharge | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (query.isLoading) {
    return (
      <div role="status" aria-label="Cargando suscripciones" className="flex flex-col gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState
        mascotUrl={mascotAlert}
        title="No pudimos cargar tus suscripciones"
        description="Revisá tu conexión y probá de nuevo."
        action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
      />
    )
  }

  const { subscriptions, charges, today } = query.data
  const byId = new Map(subscriptions.map((s) => [s.id, s]))
  const active = withStatus(subscriptions, 'active')
  const paused = withStatus(subscriptions, 'paused')
  const cancelled = withStatus(subscriptions, 'cancelled')
  const upcoming = upcomingCharges(subscriptions)
  const reminders = remindersFor(subscriptions, today)
  const known = charges.filter((c) => byId.has(c.subscriptionId))
  // Charges that need a decision are listed once, under "Para revisar"; the history has the rest.
  const attention = known.filter(needsAttention)
  const history = known.filter((c) => !needsAttention(c))
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN)
  const busy = notCharged.isPending || link.isPending || dismiss.isPending
  const open = openId ? byId.get(openId) : undefined

  async function run(action: Promise<unknown>, done: string) {
    try {
      await action
      toast.show(done)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  const rowHandlers = {
    onNotCharged: (c: SubscriptionCharge) => setReverting(c),
    onLink: (c: SubscriptionCharge) =>
      c.possibleDuplicate
        ? void run(
            link.mutateAsync({ chargeId: c.id, transactionId: c.possibleDuplicate.id }),
            'Listo: queda el gasto que cargaste vos',
          )
        : undefined,
    onDismiss: (c: SubscriptionCharge) =>
      void run(dismiss.mutateAsync(c.id), 'Listo, no es un duplicado'),
  }

  return (
    <>
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Tenés
        </p>
        <p className="flex items-baseline gap-2 font-display font-extrabold">
          <span className="text-[44px] leading-[50px]">{active.length}</span>
          <span className="text-[22px]">
            {active.length === 1 ? 'suscripción activa' : 'suscripciones activas'}
          </span>
        </p>
        <p className="text-[16px] text-text-muted-on-dark">
          {formatArs(monthlyEstimateCents(subscriptions))} por mes ·{' '}
          {formatArs(yearlyEstimateCents(subscriptions))} al año
        </p>
        <p className="mt-1 text-[13px] text-text-muted-on-dark">
          Estimado en pesos, según lo que cargaste.
        </p>
      </section>

      {reminders.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-[#d9c9a6] px-4 py-3">
          {reminders.map((r) => (
            <p key={r.subscriptionId} className="flex items-start gap-2 text-[16px] leading-5">
              <BellRing aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>
                <strong className="font-extrabold">{r.text}</strong>
              </span>
            </p>
          ))}
          <p className="text-[13px] text-text-muted">
            Aviso dentro de Moni. Todavía no enviamos notificaciones push.
          </p>
        </div>
      )}

      {subscriptions.length === 0 && (
        <div className="rounded-[24px] border border-sand bg-white p-4">
          <EmptyState
            mascotUrl={mascotAssistant}
            title="Todavía no cargaste suscripciones"
            description="Elegí Netflix, ChatGPT, tu gimnasio o la que sea: Moni registra el gasto el día del cobro."
            action={<Button onClick={onAdd}>Agregar una suscripción</Button>}
          />
        </div>
      )}

      {attention.length > 0 && (
        <>
          <SectionLabel>Para revisar</SectionLabel>
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {attention.map((c) => {
              const s = byId.get(c.subscriptionId)
              return s ? (
                <ChargeRow
                  key={c.id}
                  charge={c}
                  subscription={s}
                  today={today}
                  busy={busy}
                  {...rowHandlers}
                />
              ) : null
            })}
          </ul>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionLabel>Próximos cobros</SectionLabel>
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {upcoming.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                today={today}
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </ul>
        </>
      )}

      {history.length > 0 && (
        <>
          <SectionLabel>Historial de cobros</SectionLabel>
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {shown.map((c) => {
              const s = byId.get(c.subscriptionId)
              return s ? (
                <ChargeRow
                  key={c.id}
                  charge={c}
                  subscription={s}
                  today={today}
                  busy={busy}
                  {...rowHandlers}
                />
              ) : null
            })}
          </ul>
          {history.length > HISTORY_SHOWN && !showAll && (
            <Button variant="ghost" className="text-forest" onClick={() => setShowAll(true)}>
              Ver todo el historial
            </Button>
          )}
        </>
      )}

      {paused.length > 0 && (
        <>
          <SectionLabel>Pausadas</SectionLabel>
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {paused.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                today={today}
                muted
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </ul>
        </>
      )}

      {cancelled.length > 0 && (
        <>
          <SectionLabel>Canceladas en Moni</SectionLabel>
          <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-white">
            {cancelled.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                today={today}
                muted
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </ul>
        </>
      )}

      {open && !editing && (
        <SubscriptionDetailSheet
          subscription={open}
          charges={charges}
          today={today}
          busy={busy}
          onEdit={() => setEditing(open)}
          onClose={() => setOpenId(null)}
          {...rowHandlers}
        />
      )}
      {editing && (
        <SubscriptionFormSheet
          target={{ kind: 'edit', subscription: editing }}
          onClose={() => setEditing(null)}
        />
      )}
      {reverting && (
        <ConfirmDialog
          title="¿No se cobró?"
          message={`Moni anula el gasto de ${formatArs(reverting.amountCents)} del ${formatCompactDate(reverting.dueOn)} y devuelve el importe a la cuenta. El cobro queda en el historial como «No se cobró».`}
          confirmLabel="Sí, no se cobró"
          cancelLabel="Volver"
          isBusy={notCharged.isPending}
          onConfirm={() => {
            const charge = reverting
            setReverting(null)
            void run(notCharged.mutateAsync(charge.id), 'Cobro anulado')
          }}
          onCancel={() => setReverting(null)}
        />
      )}
    </>
  )
}

function SubscriptionRow({
  subscription: s,
  today,
  muted = false,
  onOpen,
}: {
  subscription: Subscription
  today: string
  muted?: boolean
  onOpen: () => void
}) {
  const when =
    s.status === 'active'
      ? `cobra ${formatRelativeDay(s.nextChargeOn, today).toLowerCase()}`
      : s.status === 'paused'
        ? 'pausada'
        : 'cancelada en Moni'
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${s.name}, ${when}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ServiceLogo
          serviceId={s.serviceId}
          size="md"
          className={muted ? 'opacity-60' : undefined}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-extrabold">{s.name}</span>
          <span className="block text-[15px] leading-5 text-text-muted">
            {when} · {s.accountName}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[18px] font-extrabold">{formatArs(s.amountCents)}</span>
          <span className="block text-[14px] text-text-muted">
            {s.period === 'yearly' ? 'por año' : 'por mes'}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
      </button>
    </li>
  )
}
