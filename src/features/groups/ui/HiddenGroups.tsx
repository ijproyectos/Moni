import { Archive, EyeOff, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { SwipeRow } from '@/shared/ui/SwipeRow'
import { useToast } from '@/shared/ui/toastContext'
import type { HiddenGroup } from '../domain/group'
import { useHiddenGroups, usePurgeGroup, useRestoreGroup } from '../api/useGroups'
import { GROUP_KIND_LABELS } from '../domain/group'

/** "Eliminados y archivados": groups I removed from my account (restorable) and groups archived for everybody (read-only). */
export function HiddenGroupsEntry() {
  const hidden = useHiddenGroups()
  const [open, setOpen] = useState(false)
  const list = hidden.data ?? []
  // Once opened it stays (it says there is nothing left after the last one is deleted); the entry itself only exists with items.
  if (list.length === 0 && !open) return null
  return (
    <>
      {list.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex min-h-11 items-center gap-2 px-4 text-[15px] font-extrabold text-text-muted"
        >
          <EyeOff aria-hidden="true" className="size-4" />
          Eliminados y archivados ({list.length})
        </button>
      )}
      {open && <HiddenGroupsSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** What is asked before deleting for good: one group or trip, or all of them at once. */
type Confirm = { type: 'one'; group: HiddenGroup } | { type: 'all' }

const isTrip = (g: HiddenGroup) => g.kind === 'viaje'

function HiddenGroupsSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const hidden = useHiddenGroups()
  const restore = useRestoreGroup()
  const purge = usePurgeGroup()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [working, setWorking] = useState(false)
  const list = hidden.data ?? []

  async function restoreOne(id: string) {
    try {
      await restore.mutateAsync(id)
      toast.show('Grupo restaurado', { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  /** Deletes one by one: the server decides each (debts or unconfirmed payments keep one in the list, with its reason). */
  async function deleteForGood(targets: readonly HiddenGroup[]) {
    if (working) return
    setWorking(true)
    let done = 0
    let firstError: unknown = null
    for (const g of targets) {
      try {
        await purge.mutateAsync(g.id)
        done += 1
      } catch (e) {
        firstError ??= e
      }
    }
    setWorking(false)
    setConfirm(null)
    const failed = targets.length - done
    if (failed === 0) {
      toast.show(
        targets.length === 1
          ? 'Eliminado definitivamente'
          : `Se eliminaron ${done} definitivamente`,
        { mascotUrl: mascotHappy },
      )
    } else {
      const reason = toUserMessage(firstError)
      toast.show(done > 0 ? `Se eliminaron ${done}. ${failed} no se pudo: ${reason}` : reason, {
        tone: 'error',
        mascotUrl: mascotAlert,
      })
    }
  }

  const confirmTargets = confirm?.type === 'one' ? [confirm.group] : list
  const oneTrip = confirm?.type === 'one' && isTrip(confirm.group)

  return (
    <BottomSheet title="Eliminados y archivados" onClose={onClose}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-text-muted">
          No tenés grupos eliminados ni archivados.
        </p>
      ) : (
        <>
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={() => setConfirm({ type: 'all' })}
              className="flex min-h-11 items-center px-2 text-[14px] font-extrabold text-expense"
            >
              Eliminar todos
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {list.map((g) => (
              <li key={g.id}>
                <SwipeRow
                  actions={[
                    {
                      label: 'Eliminar',
                      tone: 'danger',
                      icon: <Trash2 className="size-5" strokeWidth={2.2} />,
                      ariaLabel: `Eliminar ${g.name} definitivamente`,
                      onPress: () => setConfirm({ type: 'one', group: g }),
                    },
                  ]}
                >
                  <div className="flex min-h-16 items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-extrabold">{g.name}</span>
                      <span className="flex items-center gap-1 text-[13px] font-bold text-text-muted">
                        {g.archivedAt ? (
                          <Archive aria-hidden="true" className="size-3.5" />
                        ) : (
                          <EyeOff aria-hidden="true" className="size-3.5" />
                        )}
                        {g.archivedAt ? 'Eliminado para todos' : 'Eliminado para mí'}
                      </span>
                      <span className="block text-[12.5px] text-text-muted">
                        {GROUP_KIND_LABELS[g.kind]} · {g.memberCount}{' '}
                        {g.memberCount === 1 ? 'persona' : 'personas'} · última actividad{' '}
                        {formatDayMonth(g.lastActivity.slice(0, 10))}
                      </span>
                    </span>
                    {g.archivedAt ? (
                      <Link
                        to={`/grupos/${g.id}`}
                        onClick={onClose}
                        className="flex min-h-10 items-center justify-center rounded-full border-2 border-line px-3 text-[13px] font-extrabold"
                      >
                        Ver historial
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={restore.isPending}
                        onClick={() => void restoreOne(g.id)}
                        aria-label={`Restaurar ${g.name}`}
                        className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
                      >
                        <RotateCcw aria-hidden="true" className="size-4" /> Restaurar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirm({ type: 'one', group: g })}
                      aria-label={`Eliminar ${g.name} definitivamente`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-expense"
                    >
                      <Trash2 aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </>
      )}
      {confirm && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title={
            confirm.type === 'one'
              ? `¿Querés eliminar ${oneTrip ? 'este viaje' : 'este grupo'} definitivamente?`
              : `¿Eliminar definitivamente ${confirmTargets.length} ${confirmTargets.length === 1 ? 'grupo o viaje' : 'grupos y viajes'}?`
          }
          onClose={() => {
            if (!working) setConfirm(null)
          }}
          actions={[
            {
              label: working
                ? 'Eliminando…'
                : confirm.type === 'one'
                  ? 'Eliminar definitivamente'
                  : 'Eliminar todos',
              tone: 'danger',
              disabled: working,
              onClick: () => void deleteForGood(confirmTargets),
            },
            {
              label: 'Cancelar',
              tone: 'outline',
              disabled: working,
              onClick: () => setConfirm(null),
            },
          ]}
        >
          <p>
            {confirm.type === 'one'
              ? 'No vas a poder restaurarlo. '
              : 'Esta acción no se puede deshacer: no vas a poder restaurarlos. '}
            Lo que comparten otras personas (gastos, pagos y saldos) no se borra. Si tenés deudas
            pendientes en alguno, ese no se elimina.
          </p>
        </DecisionSheet>
      )}
    </BottomSheet>
  )
}
