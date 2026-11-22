import { Hourglass, X } from 'lucide-react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { useToast } from '@/shared/ui/toastContext'
import { useCancelJoinRequest, useMyJoinRequests } from '../api/useGroups'

/**
 * The groups I asked to join and that have not answered yet (and the ones that said no in the last days). The person is not in
 * those groups: all that is shown is the group's name.
 */
export function PendingRequests() {
  const toast = useToast()
  const requests = useMyJoinRequests()
  const cancel = useCancelJoinRequest()
  const list = requests.data ?? []
  if (list.length === 0) return null

  async function cancelOne(id: string) {
    try {
      await cancel.mutateAsync(id)
      toast.show('Cancelaste tu solicitud', { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  return (
    <ul aria-label="Solicitudes para entrar a grupos" className="flex flex-col gap-2">
      {list.map((r) => (
        <li key={r.id} className="flex min-h-16 items-center gap-3 rounded-[22px] border border-line bg-card px-4 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint-gold text-ink">
            <Hourglass aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-extrabold">{r.groupName}</span>
            <span className="block text-[13px] text-text-muted">
              {r.status === 'pending' ? 'Esperando que un administrador te acepte' : 'No te aceptaron esta vez'}
            </span>
          </span>
          {r.status === 'pending' && (
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => void cancelOne(r.id)}
              aria-label={`Cancelar solicitud a ${r.groupName}`}
              className="flex min-h-11 items-center gap-1 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
            >
              <X aria-hidden="true" className="size-4" /> Cancelar
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
