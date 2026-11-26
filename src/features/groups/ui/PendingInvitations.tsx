import { Check, UsersRound, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { joinErrorMessage } from '@/shared/lib/errors'
import { useToast } from '@/shared/ui/toastContext'
import { useMyInvitations, useRespondInvitation } from '../api/useGroups'

/**
 * The invitations I received from a group administrator. Nothing of the group is shown (only its name and who invited me) and
 * nobody is added until I accept.
 */
export function PendingInvitations() {
  const toast = useToast()
  const navigate = useNavigate()
  const invitations = useMyInvitations()
  const respond = useRespondInvitation()
  const list = invitations.data ?? []
  if (list.length === 0) return null

  async function answer(id: string, groupName: string, accept: boolean) {
    try {
      const group = await respond.mutateAsync({ invitationId: id, accept })
      if (accept && group) {
        toast.show(`Ya sos parte de ${groupName}`, { mascotUrl: mascotHappy })
        navigate(`/grupos/${group}`)
      } else {
        toast.show(accept ? 'Esa invitación ya venció' : 'Rechazaste la invitación', { mascotUrl: mascotHappy })
      }
    } catch (e) {
      toast.show(joinErrorMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  return (
    <ul aria-label="Invitaciones a grupos" className="flex flex-col gap-2">
      {list.map((i) => (
        <li key={i.id} className="flex min-h-16 items-center gap-3 rounded-[22px] border-2 border-ink/20 bg-card px-4 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint-green text-ink">
            <UsersRound aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-extrabold">{i.groupName}</span>
            <span className="block text-[13px] text-text-muted">Te invitó {i.invitedByName}</span>
          </span>
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => void answer(i.id, i.groupName, false)}
            aria-label={`Rechazar invitación a ${i.groupName}`}
            className="flex min-h-11 items-center gap-1 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
          >
            <X aria-hidden="true" className="size-4" /> No
          </button>
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => void answer(i.id, i.groupName, true)}
            aria-label={`Aceptar invitación a ${i.groupName}`}
            className="flex min-h-11 items-center gap-1 rounded-full bg-forest px-3 text-[13px] font-extrabold text-cream disabled:opacity-60 dark:bg-lime dark:text-on-bright"
          >
            <Check aria-hidden="true" className="size-4" /> Aceptar
          </button>
        </li>
      ))}
    </ul>
  )
}
