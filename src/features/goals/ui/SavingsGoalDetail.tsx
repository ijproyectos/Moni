import { BellRing, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { formatCompactDate, formatDayMonth, formatShortDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { Archive, CircleCheck, Unlock } from 'lucide-react'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useToast } from '@/shared/ui/toastContext'
import { useSetGoalStatus, useVoidMovement, useWithdrawReserve } from '../api/useSavings'
import {
  describeSchedule,
  exceededCents,
  missingCents,
  percentText,
  savingsAlerts,
  barValue,
  FREQUENCY_LABELS,
  type SavingsMovement,
  type SavingsOverview,
  type SavingsGoal,
} from '../domain/savings'
import { GoalMoneySheet } from './GoalMoneySheet'
import { SavingsAlertCard } from './SavingsAlertCard'
import { SavingsGoalFormSheet } from './SavingsGoalFormSheet'
import { SavingsHero } from './goalVisuals'
import { SnoozeSheet } from './SnoozeSheet'

type Dialog = null | 'complete' | 'archive' | 'release'

/**
 * Detail of a savings goal: what is reserved, the account that holds the money and what is free in it, the history of
 * contributions and withdrawals, and the actions: add, withdraw, edit, complete, pause and archive.
 */
export function SavingsGoalDetail({
  goal,
  overview,
}: {
  goal: SavingsGoal
  overview: SavingsOverview
}) {
  const toast = useToast()
  const setStatus = useSetGoalStatus()
  const voidMovement = useVoidMovement()
  const withdraw = useWithdrawReserve()
  const [sheet, setSheet] = useState<null | 'deposit' | 'withdraw' | 'edit' | 'snooze'>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [voiding, setVoiding] = useState<SavingsMovement | null>(null)
  const account = overview.accounts.find((a) => a.id === goal.accountId)
  const alert = savingsAlerts(overview).find((a) => a.accountId === goal.accountId)
  const movements = overview.movements.filter((m) => m.goalId === goal.id)
  const exceeded = exceededCents(goal)
  const schedule = describeSchedule(goal.frequency, goal.anchorOn)
  const open = goal.status === 'active' || goal.status === 'paused'
  const reserved = goal.reservedCents

  async function change(
    status: 'active' | 'paused' | 'completed' | 'archived',
    release: boolean,
    done: string,
  ) {
    try {
      await setStatus.mutateAsync({ id: goal.id, status, release })
      toast.show(done)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
    setDialog(null)
  }

  async function confirmVoid() {
    if (!voiding) return
    const movement = voiding
    setVoiding(null)
    try {
      await voidMovement.mutateAsync(movement.id)
      toast.show('Movimiento anulado')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <Page>
      <PageHeader title={goal.name} backTo="/metas" />
      <SavingsHero
        label={
          goal.status === 'completed'
            ? 'Meta completada'
            : goal.status === 'paused'
              ? 'Meta pausada'
              : goal.status === 'archived'
                ? 'Meta archivada'
                : 'Reservado'
        }
        savedCents={reserved}
        targetCents={goal.targetCents}
        progressValue={barValue(goal)}
        footer={
          <span className="flex flex-wrap justify-between gap-x-3 font-extrabold">
            <span>{percentText(goal)} reservado</span>
            <span>
              {exceeded > 0
                ? `Superaste la meta por ${formatArs(exceeded)}`
                : `Faltan ${formatArs(missingCents(goal))}`}
            </span>
          </span>
        }
      />

      <Panel className="flex flex-col gap-1">
        <p className="text-[15px] leading-5 text-text-muted">Cuenta</p>
        <p className="text-[19px] font-extrabold">
          {goal.accountName}
          {!goal.accountUsable && (
            <span className="ml-2 text-[14px] text-expense">no disponible</span>
          )}
        </p>
        {account && (
          <p className="text-[15px] leading-5 text-text-muted">
            Saldo real {formatArs(account.balanceCents)} · reservado para metas{' '}
            {formatArs(account.reservedCents)} ·{' '}
            <strong className={account.freeCents < 0 ? 'text-expense' : 'text-forest'}>
              libre {formatArs(account.freeCents)}
            </strong>
          </p>
        )}
        {goal.targetDate && (
          <p className="text-[15px] leading-5 text-text-muted">
            Para el {formatShortDate(goal.targetDate)}
          </p>
        )}
        <p className="text-[15px] leading-5 text-text-muted">
          Ahorro: {FREQUENCY_LABELS[goal.frequency].toLowerCase()}
          {goal.suggestedCents !== null && ` · orientativo ${formatArs(goal.suggestedCents)}`}
        </p>
        {schedule && goal.remind && (
          <p className="flex items-center gap-1 text-[15px] font-extrabold text-forest">
            <BellRing aria-hidden="true" className="size-4" />
            {schedule}
            {goal.status === 'active' &&
              goal.reminderOn &&
              ` · próximo ${formatCompactDate(goal.reminderOn)}`}
          </p>
        )}
      </Panel>

      {alert && <SavingsAlertCard alert={alert} />}
      {!goal.accountUsable && goal.status !== 'archived' && (
        <p role="alert" className="flex items-start gap-2 text-[15px] leading-5 text-expense">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          La cuenta de esta meta ya no está disponible. Editá la meta para pasarla a otra cuenta.
        </p>
      )}

      {goal.status === 'active' && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setSheet('deposit')}>Agregar dinero</Button>
          <Button variant="dark" onClick={() => setSheet('withdraw')} disabled={reserved <= 0}>
            Retirar
          </Button>
        </div>
      )}
      {goal.status === 'completed' && reserved > 0 && (
        <Button variant="dark" onClick={() => setDialog('release')}>
          Liberar los {formatArs(reserved)} reservados
        </Button>
      )}
      {goal.status === 'active' &&
        goal.remind &&
        goal.reminderOn &&
        goal.reminderOn <= overview.today && (
          <Button variant="ghost" className="text-forest" onClick={() => setSheet('snooze')}>
            Posponer el recordatorio
          </Button>
        )}

      <Panel>
        <h2 className="text-[20px] font-extrabold">Historial</h2>
        {movements.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-muted">Todavía no hay aportes ni retiros.</p>
        ) : (
          <ul className="mt-1 divide-y divide-sand">
            {movements.map((m) => {
              const posted = m.status === 'posted'
              return (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-extrabold">
                      {m.kind === 'deposit' ? 'Aporte' : 'Retiro'}
                      {m.note ? ` · ${m.note}` : ''}
                    </span>
                    <span className="block text-[15px] text-text-muted">
                      {formatDayMonth(m.occurredOn)}
                      {!posted && ' · anulado'}
                    </span>
                    {posted && goal.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => setVoiding(m)}
                        aria-label={`Anular ${m.kind === 'deposit' ? 'aporte' : 'retiro'} de ${formatArs(m.amountCents)}`}
                        className="text-[14px] font-extrabold text-expense underline"
                      >
                        Anular
                      </button>
                    )}
                  </span>
                  <span
                    className={
                      posted
                        ? m.kind === 'deposit'
                          ? 'text-[17px] font-extrabold text-forest'
                          : 'text-[17px] font-extrabold text-text-muted'
                        : 'text-[17px] font-extrabold text-text-muted line-through'
                    }
                  >
                    {m.kind === 'deposit' ? '+' : '-'}
                    {formatArs(m.amountCents)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-[13px] leading-4 text-text-muted">
          Reservar o retirar no es un gasto ni un ingreso y no cambia el saldo de tu cuenta.
        </p>
      </Panel>

      <div className="flex flex-col gap-2">
        {goal.status !== 'archived' && (
          <Button variant="ghost" className="text-forest" onClick={() => setSheet('edit')}>
            Editar meta
          </Button>
        )}
        {goal.status === 'active' && (
          <>
            <Button variant="ghost" className="text-forest" onClick={() => setDialog('complete')}>
              Marcar como completada
            </Button>
            <Button
              variant="ghost"
              className="text-forest"
              onClick={() =>
                void change('paused', false, 'Meta pausada: sigue reservando su dinero')
              }
            >
              Pausar
            </Button>
          </>
        )}
        {(goal.status === 'paused' ||
          goal.status === 'completed' ||
          goal.status === 'archived') && (
          <Button variant="dark" onClick={() => void change('active', false, 'Meta reactivada')}>
            Reactivar
          </Button>
        )}
        {open || goal.status === 'completed' ? (
          <Button variant="ghost" className="text-expense" onClick={() => setDialog('archive')}>
            Archivar
          </Button>
        ) : null}
      </div>

      {sheet === 'deposit' && (
        <GoalMoneySheet
          goal={goal}
          account={account}
          mode="deposit"
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'withdraw' && (
        <GoalMoneySheet
          goal={goal}
          account={account}
          mode="withdraw"
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'edit' && <SavingsGoalFormSheet goal={goal} onClose={() => setSheet(null)} />}
      {sheet === 'snooze' && <SnoozeSheet goal={goal} onClose={() => setSheet(null)} />}

      {dialog === 'complete' && (
        <DecisionSheet
          icon={<CircleCheck className="size-6" />}
          iconTone="neutral"
          title="¿Completaste la meta?"
          onClose={() => setDialog(null)}
          actions={
            reserved > 0
              ? [
                  {
                    label: `Completar y liberar ${formatArs(reserved)}`,
                    tone: 'primary',
                    disabled: setStatus.isPending,
                    onClick: () =>
                      void change('completed', true, 'Meta completada: reserva liberada'),
                  },
                  {
                    label: 'Completar y mantener reservado',
                    tone: 'outline',
                    disabled: setStatus.isPending,
                    onClick: () =>
                      void change('completed', false, 'Meta completada: sigue reservado'),
                  },
                  { label: 'Volver', tone: 'outline', onClick: () => setDialog(null) },
                ]
              : [
                  {
                    label: 'Completar',
                    tone: 'primary',
                    disabled: setStatus.isPending,
                    onClick: () => void change('completed', false, 'Meta completada'),
                  },
                  { label: 'Volver', tone: 'outline', onClick: () => setDialog(null) },
                ]
          }
        >
          <p>
            {reserved > 0
              ? `Tiene ${formatArs(reserved)} reservados. Podés mantenerlos reservados o liberarlos para volver a gastarlos: la plata no se mueve de ${goal.accountName}.`
              : 'La meta pasa a completada y conservás todo su historial.'}
          </p>
        </DecisionSheet>
      )}
      {dialog === 'release' && (
        <DecisionSheet
          icon={<Unlock className="size-6" />}
          iconTone="neutral"
          title="¿Liberar la reserva?"
          onClose={() => setDialog(null)}
          actions={[
            {
              label: 'Liberar',
              tone: 'primary',
              disabled: withdraw.isPending,
              onClick: () => void releaseAll(),
            },
            { label: 'Volver', tone: 'outline', onClick: () => setDialog(null) },
          ]}
        >
          <p>
            Los {formatArs(reserved)} dejan de estar apartados y vuelven a figurar libres en{' '}
            {goal.accountName}. No se mueve plata.
          </p>
        </DecisionSheet>
      )}
      {dialog === 'archive' && (
        <DecisionSheet
          icon={<Archive className="size-6" />}
          title="¿Archivar esta meta?"
          onClose={() => setDialog(null)}
          actions={[
            {
              label: reserved > 0 ? `Liberar ${formatArs(reserved)} y archivar` : 'Archivar',
              tone: 'danger',
              disabled: setStatus.isPending,
              onClick: () => void change('archived', true, 'Meta archivada'),
            },
            { label: 'Volver', tone: 'outline', onClick: () => setDialog(null) },
          ]}
        >
          <p>
            {reserved > 0
              ? `Tiene ${formatArs(reserved)} reservados. Al archivarla se liberan: una meta archivada no deja plata apartada. Queda todo el historial y la podés reactivar.`
              : 'La meta deja de aparecer entre las activas. Conservás todo el historial y la podés reactivar.'}
          </p>
        </DecisionSheet>
      )}
      {voiding && (
        <ConfirmDialog
          title="¿Anular este movimiento?"
          message={
            voiding.kind === 'deposit'
              ? `Se anula el aporte de ${formatArs(voiding.amountCents)}: baja lo reservado de la meta. Queda en el historial como anulado.`
              : `Se anula el retiro de ${formatArs(voiding.amountCents)}: vuelve a quedar reservado (necesita dinero libre en la cuenta).`
          }
          confirmLabel="Anular"
          cancelLabel="Volver"
          isBusy={voidMovement.isPending}
          onConfirm={() => void confirmVoid()}
          onCancel={() => setVoiding(null)}
        />
      )}
    </Page>
  )

  async function releaseAll() {
    // The whole reserve goes back to free money in one withdrawal (history kept).
    setDialog(null)
    try {
      await withdraw.mutateAsync({
        goalId: goal.id,
        amountCents: reserved,
        requestKey: crypto.randomUUID(),
        note: 'Reserva liberada',
      })
      toast.show('Reserva liberada')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }
}
