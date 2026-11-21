import { Archive, EyeOff, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { useToast } from '@/shared/ui/toastContext'
import { useHiddenGroups, useRestoreGroup } from '../api/useGroups'
import { GROUP_KIND_LABELS } from '../domain/group'

/** "Ocultos y archivados": groups I removed from my account (restorable) and groups archived for everybody (read-only). */
export function HiddenGroupsEntry() {
  const hidden = useHiddenGroups()
  const [open, setOpen] = useState(false)
  const list = hidden.data ?? []
  if (list.length === 0) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex min-h-11 items-center gap-2 px-4 text-[15px] font-extrabold text-text-muted"
      >
        <EyeOff aria-hidden="true" className="size-4" />
        Ocultos y archivados ({list.length})
      </button>
      {open && <HiddenGroupsSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function HiddenGroupsSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const hidden = useHiddenGroups()
  const restore = useRestoreGroup()

  async function restoreOne(id: string) {
    try {
      await restore.mutateAsync(id)
      toast.show('Grupo restaurado', { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  return (
    <BottomSheet title="Ocultos y archivados" onClose={onClose}>
      <ul className="flex flex-col divide-y divide-line">
        {(hidden.data ?? []).map((g) => (
          <li key={g.id} className="flex min-h-16 items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold">{g.name}</span>
              <span className="flex items-center gap-1 text-[13px] text-text-muted">
                {g.archivedAt ? <Archive aria-hidden="true" className="size-3.5" /> : <EyeOff aria-hidden="true" className="size-3.5" />}
                {g.archivedAt ? 'Archivado para todos' : 'Oculto en tu cuenta'} · {GROUP_KIND_LABELS[g.kind]}
              </span>
            </span>
            {g.archivedAt ? (
              <Link to={`/grupos/${g.id}`} onClick={onClose} className="flex min-h-11 items-center rounded-full border-2 border-line px-3 text-[13px] font-extrabold">
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
          </li>
        ))}
      </ul>
      <p className="pt-3 text-[13px] leading-5 text-text-muted">
        Un grupo oculto sigue siendo tuyo: sus deudas suman en tus totales y seguís recibiendo sus avisos. Los archivados quedan solo para consultar.
      </p>
    </BottomSheet>
  )
}
