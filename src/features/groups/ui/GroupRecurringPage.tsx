import { CalendarClock, Check, History, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import mascotUrl from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatArs, fromCents } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useConfirmOccurrence,
  useGroup,
  useGroupMembers,
  useGroupRecurring,
  useIsGroupAdmin,
  useRecurringOccurrences,
  useSetRecurringStatus,
  useSkipOccurrence,
} from '../api/useGroups'
import { RECURRING_PERIOD_LABELS, type GroupRecurring, type RecurringOccurrence } from '../domain/group'
import { RecurringFormSheet } from './RecurringFormSheet'

const pill = 'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-extrabold disabled:opacity-60'

function splitLine(r: GroupRecurring, amountCents: number): string {
  const n = r.participants.length
  if (r.splitMethod === 'percent') return r.participants.map((p) => `${p.name} ${p.percent}%`).join(' · ')
  return `Entre ${r.participants.map((p) => p.name).join(', ')} · ${formatArs(Math.round(amountCents / Math.max(1, n)))} c/u`
}

/** "Gastos recurrentes" of a home group: what repeats, the periods waiting for a one-tap confirmation, and their history. */
export function GroupRecurringPage() {
  const { id: groupId = '' } = useParams()
  const toast = useToast()
  const { user } = useAuth()
  const group = useGroup(groupId)
  const recurring = useGroupRecurring(groupId)
  const occurrences = useRecurringOccurrences(groupId)
  const members = useGroupMembers(groupId)
  const isAdmin = useIsGroupAdmin(groupId, user?.id)
  const confirm = useConfirmOccurrence(groupId)
  const skip = useSkipOccurrence(groupId)
  const setStatus = useSetRecurringStatus(groupId)
  const [form, setForm] = useState<GroupRecurring | 'new' | null>(null)
  const [history, setHistory] = useState<GroupRecurring | null>(null)
  const [removing, setRemoving] = useState<GroupRecurring | null>(null)
  const [changing, setChanging] = useState<{ occ: RecurringOccurrence; text: string } | null>(null)

  const byId = useMemo(() => new Map((recurring.data ?? []).map((r) => [r.id, r])), [recurring.data])
  const pending = (occurrences.data ?? []).filter((o) => o.status === 'pending' && byId.get(o.recurringId)?.status === 'active')
  const isHome = group.data ? ['hogar', 'casa'].includes(group.data.kind) : true

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast.show(done, { mascotUrl: mascotHappy })
      return true
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
      return false
    }
  }

  return (
    <Page>
      <PageHeader title="Gastos recurrentes" fallbackTo={`/grupos/${groupId}`} />
      {recurring.isLoading ? (
        <div role="status" aria-label="Cargando gastos recurrentes" className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-24" />
        </div>
      ) : recurring.isError ? (
        <EmptyState mascotUrl={mascotAlert} title="No pudimos cargar los gastos recurrentes" description="Revisá tu conexión y probá de nuevo." />
      ) : !isHome ? (
        <EmptyState mascotUrl={mascotUrl} title="Solo para grupos de Hogar" description="Los gastos recurrentes sirven para alquiler, expensas, servicios y más." />
      ) : (
        <>
          {pending.length > 0 && (
            <section aria-label="Para registrar" className="flex flex-col gap-2.5">
              <SectionLabel>Tenés un gasto recurrente para registrar</SectionLabel>
              {pending.map((o) => {
                const r = byId.get(o.recurringId) as GroupRecurring
                const canConfirm = user?.id === r.paidBy || isAdmin
                return (
                  <div key={o.id} className="rounded-[24px] border-2 border-ink/20 bg-card p-4">
                    <p className="font-display text-[20px] font-extrabold leading-6">
                      {r.name} · {formatDayMonth(o.dueOn)}
                    </p>
                    <p className="font-display text-[32px] font-extrabold leading-9">{formatArs(o.amountCents)}</p>
                    <p className="text-[14px] leading-5 text-text-muted">
                      {splitLine(r, o.amountCents)} · Lo paga {r.paidByName}
                    </p>
                    {changing?.occ.id === o.id && (
                      <AmountInput
                        value={changing.text}
                        onChange={(e) => setChanging({ occ: o, text: e.target.value })}
                        aria-label={`Importe de ${r.name} para este período`}
                        scale="md"
                        className="mt-2"
                      />
                    )}
                    {canConfirm ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={confirm.isPending}
                          onClick={() => {
                            const cents = changing?.occ.id === o.id ? parseAmountInput(changing.text) : null
                            if (changing?.occ.id === o.id && (!cents || cents <= 0)) {
                              toast.show('Ingresá un importe válido.', { tone: 'error' })
                              return
                            }
                            void run(
                              () => confirm.mutateAsync({ occurrenceId: o.id, amountCents: cents }),
                              `Registraste ${r.name}`,
                            ).then(() => setChanging(null))
                          }}
                          className={cn(pill, 'bg-forest text-cream dark:bg-lime dark:text-on-bright')}
                        >
                          <Check aria-hidden="true" className="size-4" /> Confirmar gasto
                        </button>
                        {changing?.occ.id !== o.id && (
                          <button
                            type="button"
                            onClick={() => setChanging({ occ: o, text: fromCents(o.amountCents) })}
                            className={cn(pill, 'border-2 border-line bg-card text-ink')}
                          >
                            Cambiar importe
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={skip.isPending}
                          onClick={() => void run(() => skip.mutateAsync(o.id), 'Omitiste este período')}
                          className={cn(pill, 'text-text-muted')}
                        >
                          Omitir
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[14px] font-bold text-text-muted">Lo registra {r.paidByName} o un administrador.</p>
                    )}
                  </div>
                )
              })}
            </section>
          )}

          <SectionLabel>Se repiten</SectionLabel>
          {(recurring.data ?? []).length === 0 ? (
            <EmptyState
              mascotUrl={mascotUrl}
              title="Todavía no hay gastos recurrentes"
              description="Cargá el alquiler, las expensas o los servicios una vez: cada mes Moni te avisa y los registrás con un toque."
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(recurring.data ?? []).map((r) => (
                <li key={r.id} className={cn('rounded-[22px] border border-line bg-card p-4', r.status === 'paused' && 'opacity-70')}>
                  <button type="button" onClick={() => setHistory(r)} className="flex w-full items-start gap-3 text-left" aria-label={`Ver períodos de ${r.name}`}>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime/35">
                      <CalendarClock aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[18px] font-extrabold">
                        {r.name}
                        {r.status === 'paused' && <span className="rounded-full bg-tint-gold px-2 py-0.5 text-[12px]">En pausa</span>}
                      </span>
                      <span className="block text-[14px] text-text-muted">
                        {formatArs(r.amountCents)} · {RECURRING_PERIOD_LABELS[r.period]}
                        {r.status === 'active' ? ` · próximo ${formatDayMonth(r.nextDueOn)}` : ''}
                      </span>
                      <span className="block text-[13px] text-text-muted">{splitLine(r, r.amountCents)}</span>
                    </span>
                    <History aria-hidden="true" className="mt-1 size-4 shrink-0 text-text-muted" />
                  </button>
                  {isAdmin && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setForm(r)} className={cn(pill, 'border-2 border-line px-3 text-[13px]')} aria-label={`Editar ${r.name}`}>
                        <Pencil aria-hidden="true" className="size-4" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void run(() => setStatus.mutateAsync({ id: r.id, status: r.status === 'active' ? 'paused' : 'active' }), r.status === 'active' ? 'Gasto en pausa' : 'Gasto reanudado')}
                        className={cn(pill, 'border-2 border-line px-3 text-[13px]')}
                        aria-label={`${r.status === 'active' ? 'Pausar' : 'Reanudar'} ${r.name}`}
                      >
                        {r.status === 'active' ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
                        {r.status === 'active' ? 'Pausar' : 'Reanudar'}
                      </button>
                      <button type="button" onClick={() => setRemoving(r)} className={cn(pill, 'border-2 border-line px-3 text-[13px] text-expense')} aria-label={`Eliminar ${r.name}`}>
                        <Trash2 aria-hidden="true" className="size-4" /> Eliminar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isAdmin ? (
            <button type="button" onClick={() => setForm('new')} className={cn(pill, 'w-full bg-forest text-cream dark:bg-lime dark:text-on-bright')}>
              <Plus aria-hidden="true" className="size-5" /> Agregar gasto recurrente
            </button>
          ) : (
            <p className="text-center text-[14px] text-text-muted">Los administradores arman y editan los gastos recurrentes.</p>
          )}
        </>
      )}

      {form && (
        <RecurringFormSheet
          groupId={groupId}
          members={members.data ?? []}
          meId={user?.id}
          editing={form === 'new' ? null : form}
          onClose={() => setForm(null)}
        />
      )}
      {history && (
        <BottomSheet title={history.name} onClose={() => setHistory(null)}>
          <p className="text-[14px] leading-5 text-text-muted">
            Períodos de este gasto. Cambiar el importe o el reparto no modifica lo que ya registraste.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {(occurrences.data ?? [])
              .filter((o) => o.recurringId === history.id)
              .map((o) => (
                <li key={o.id} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold">{formatDayMonth(o.dueOn)}</span>
                    <span className="block text-[13px] text-text-muted">
                      {o.status === 'registered' ? 'Registrado' : o.status === 'pending' ? 'Pendiente de confirmar' : 'Omitido'}
                    </span>
                  </span>
                  <span className="text-[16px] font-extrabold">{o.status === 'skipped' ? '—' : formatArs(o.amountCents)}</span>
                </li>
              ))}
            {(occurrences.data ?? []).filter((o) => o.recurringId === history.id).length === 0 && (
              <li className="py-3 text-[14px] text-text-muted">Todavía no llegó ningún período.</li>
            )}
          </ul>
        </BottomSheet>
      )}
      {removing && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title={`¿Eliminar “${removing.name}”?`}
          onClose={() => setRemoving(null)}
          actions={[
            {
              label: 'Eliminar gasto recurrente',
              tone: 'danger',
              onClick: () => {
                const target = removing
                setRemoving(null)
                void run(() => setStatus.mutateAsync({ id: target.id, status: 'removed' }), 'Gasto recurrente eliminado')
              },
            },
            { label: 'Cancelar', tone: 'outline', onClick: () => setRemoving(null) },
          ]}
        >
          <p>Deja de repetirse. Los gastos que ya registraste se conservan, con sus saldos.</p>
        </DecisionSheet>
      )}
    </Page>
  )
}
