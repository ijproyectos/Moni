import { Archive, Check, EyeOff, Shield, ShieldOff, X } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/ui/cn'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  useApproveJoinRequest,
  useArchiveGroup,
  useGroupMembers,
  useHideGroup,
  useJoinRequests,
  useRejectJoinRequest,
  useSetMemberRole,
} from '../api/useGroups'
import { fieldClass } from './styles'

/** Administrators of the group: who they are, and (for an administrator) who else can become one. */
export function AdminMembersSection({ groupId, meId }: { groupId: string; meId: string | undefined }) {
  const toast = useToast()
  const members = useGroupMembers(groupId)
  const setRole = useSetMemberRole()
  const active = (members.data ?? []).filter((m) => m.leftAt === null)
  const admins = active.filter((m) => m.role === 'owner').length

  async function change(userId: string, role: 'owner' | 'member') {
    try {
      await setRole.mutateAsync({ groupId, userId, role })
      toast.show(role === 'owner' ? 'Ahora es administrador' : 'Ya no es administrador', { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  if (active.length === 0) return null
  return (
    <>
      <SectionLabel>Administradores</SectionLabel>
      <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-4">
        {active.map((m) => {
          const isAdmin = m.role === 'owner'
          const name = m.userId === meId ? 'Vos' : (m.displayName ?? 'Integrante')
          return (
            <li key={m.userId} className="flex min-h-14 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-extrabold">{name}</span>
                <span className="block text-[13px] text-text-muted">{isAdmin ? 'Administrador' : 'Integrante'}</span>
              </span>
              <button
                type="button"
                disabled={setRole.isPending || (isAdmin && admins <= 1)}
                onClick={() => void change(m.userId, isAdmin ? 'member' : 'owner')}
                aria-label={`${isAdmin ? 'Quitar administrador a' : 'Hacer administrador a'} ${name}`}
                className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-50"
              >
                {isAdmin ? <ShieldOff aria-hidden="true" className="size-4" /> : <Shield aria-hidden="true" className="size-4" />}
                {isAdmin ? 'Quitar' : 'Hacer admin'}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** "Quitar de mi cuenta": only I stop seeing the group. Debts and the others' access do not change. */
export function HideGroupSheet({ groupId, name, onClose, onDone }: { groupId: string; name: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const hide = useHideGroup()
  return (
    <DecisionSheet
      icon={<EyeOff className="size-6" />}
      iconTone="neutral"
      title={`¿Quitar “${name}” de tu cuenta?`}
      onClose={onClose}
      actions={[
        {
          label: 'Quitar de mi cuenta',
          disabled: hide.isPending,
          onClick: () =>
            void hide
              .mutateAsync(groupId)
              .then(() => {
                toast.show('Grupo quitado de tu cuenta', { mascotUrl: mascotHappy })
                onDone()
              })
              .catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })),
        },
        { label: 'Cancelar', tone: 'outline', onClick: onClose },
      ]}
    >
      <p>
        Dejás de verlo en tu lista, pero seguís siendo parte del grupo: tus deudas siguen sumando en tus totales, seguís
        recibiendo recordatorios y avisos de pagos, y los demás no se enteran. Lo restaurás en «Ocultos y archivados».
      </p>
    </DecisionSheet>
  )
}

/** "Eliminar para todos": administrators only. It archives the group (history kept) and the server refuses it with debts. */
export function ArchiveGroupSheet({ groupId, name, onClose, onDone }: { groupId: string; name: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const archive = useArchiveGroup()
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase()
  return (
    <DecisionSheet
      icon={<Archive className="size-6" />}
      title={`¿Eliminar “${name}” para todos?`}
      onClose={onClose}
      actions={[
        {
          label: 'Eliminar para todos',
          tone: 'danger',
          disabled: !matches || archive.isPending,
          onClick: () =>
            void archive
              .mutateAsync({ groupId, name: typed })
              .then(() => {
                toast.show('Grupo eliminado para todos. El historial queda guardado.', { mascotUrl: mascotHappy })
                onDone()
              })
              .catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })),
        },
        { label: 'Cancelar', tone: 'outline', onClick: onClose },
      ]}
    >
      <p>
        El grupo se archiva para todas las personas: queda solo para consultar, nadie puede cargar gastos nuevos y se cierran
        los códigos de invitación. Los gastos y pagos no se borran. Solo se puede si no hay deudas ni pagos sin confirmar.
      </p>
      <label className="mt-3 flex flex-col gap-1.5 text-[14px] font-bold">
        Escribí el nombre del grupo para confirmar
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Nombre del grupo para confirmar"
          placeholder={name}
          autoComplete="off"
          className={cn(fieldClass, 'font-normal')}
        />
      </label>
    </DecisionSheet>
  )
}

/** People waiting to be accepted in the group (administrators only: the server refuses anybody else). */
export function JoinRequestsSection({ groupId }: { groupId: string }) {
  const toast = useToast()
  const requests = useJoinRequests(groupId, true)
  const approve = useApproveJoinRequest()
  const reject = useRejectJoinRequest()
  const list = requests.data ?? []
  const busy = approve.isPending || reject.isPending

  async function answer(id: string, name: string, accept: boolean) {
    try {
      if (accept) {
        const group = await approve.mutateAsync(id)
        toast.show(group ? `${name} ya es parte del grupo` : 'Esa solicitud ya venció', { mascotUrl: mascotHappy })
      } else {
        await reject.mutateAsync(id)
        toast.show(`Rechazaste la solicitud de ${name}`, { mascotUrl: mascotHappy })
      }
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  return (
    <>
      <SectionLabel>Solicitudes de ingreso{list.length > 0 ? ` (${list.length})` : ''}</SectionLabel>
      {list.length === 0 ? (
        <p className="rounded-[20px] bg-card px-4 py-3 text-[14px] leading-5 text-text-muted">
          No hay solicitudes pendientes. Quien use un código nuevo aparece acá y vos decidís si entra.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-4">
          {list.map((r) => {
            const name = r.displayName ?? 'Alguien'
            return (
              <li key={r.id} className="flex min-h-16 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-extrabold">{name}</span>
                  <span className="block text-[13px] text-text-muted">Quiere entrar al grupo</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(r.id, name, false)}
                  aria-label={`Rechazar a ${name}`}
                  className="flex min-h-11 items-center gap-1 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
                >
                  <X aria-hidden="true" className="size-4" /> No
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(r.id, name, true)}
                  aria-label={`Aceptar a ${name}`}
                  className="flex min-h-11 items-center gap-1 rounded-full bg-forest px-3 text-[13px] font-extrabold text-cream disabled:opacity-60 dark:bg-lime dark:text-on-bright"
                >
                  <Check aria-hidden="true" className="size-4" /> Aceptar
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
