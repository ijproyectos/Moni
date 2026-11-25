import { Archive, Check, ChevronLeft, EyeOff, Shield, ShieldOff, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useFormatMoney } from '@/shared/ui/useFormatMoney'
import {
  useApproveJoinRequest,
  useArchiveGroup,
  useGroupMembers,
  useHideGroup,
  useJoinRequests,
  useLeaveGroup,
  useRejectJoinRequest,
  useSetMemberRole,
} from '../api/useGroups'

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

/** "Eliminar para mí": only I stop seeing the group. Debts, movements and the others' access do not change. */
export function HideGroupSheet({ groupId, name, onClose, onDone }: { groupId: string; name: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const hide = useHideGroup()
  return (
    <DecisionSheet
      icon={<EyeOff className="size-6" />}
      iconTone="neutral"
      title={`¿Eliminar “${name}” para vos?`}
      onClose={onClose}
      actions={[
        {
          label: 'Eliminar para mí',
          disabled: hide.isPending,
          onClick: () =>
            void hide
              .mutateAsync(groupId)
              .then(() => {
                toast.show('Grupo eliminado de tu lista', { mascotUrl: mascotHappy })
                onDone()
              })
              .catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })),
        },
        { label: 'Cancelar', tone: 'outline', onClick: onClose },
      ]}
    >
      <p>
        Desaparece de tu lista. Los demás siguen con acceso, no se borra nada y tus deudas siguen contando. Lo recuperás
        en «Eliminados y archivados».
      </p>
    </DecisionSheet>
  )
}

/**
 * "Eliminar para todos": administrators only. It archives the group (history kept) and the server refuses it with debts or unconfirmed
 * payments. One tap confirms: the server still receives the group's own name as the confirmation it has always asked for, so nobody types it.
 */
export function ArchiveGroupSheet({
  groupId,
  name,
  serverName,
  onClose,
  onDone,
}: {
  groupId: string
  /** The name shown to the person (it may be a local rename). */
  name: string
  /** The group's name on the server, which is what the operation checks; falls back to `name`. */
  serverName?: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const archive = useArchiveGroup()
  const [busy, setBusy] = useState(false)
  const working = busy || archive.isPending

  async function confirm() {
    if (working) return
    setBusy(true)
    try {
      await archive.mutateAsync({ groupId, name: serverName ?? name })
      toast.show('Grupo eliminado para todos. El historial queda guardado.', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
      setBusy(false)
    }
  }

  return (
    <DecisionSheet
      icon={<Archive className="size-6" />}
      title={`¿Eliminar “${name}” para todos?`}
      onClose={() => {
        if (!working) onClose()
      }}
      actions={[
        {
          label: working ? 'Eliminando…' : 'Eliminar para todos',
          tone: 'danger',
          disabled: working,
          onClick: () => void confirm(),
        },
        { label: 'Cancelar', tone: 'outline', disabled: working, onClick: onClose },
      ]}
    >
      <p>
        Se cierra para todos: nadie podrá cargar gastos nuevos y el historial se conserva. Solo se puede si no hay deudas ni
        pagos sin confirmar.
      </p>
    </DecisionSheet>
  )
}

/** "Salir del grupo" for someone who is not an administrator: same rule as the group's own screen (only with a zero balance). */
export function LeaveGroupSheet({
  groupId,
  name,
  netCents,
  onClose,
  onDone,
}: {
  groupId: string
  name: string
  netCents: number
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const money = useFormatMoney()
  const leave = useLeaveGroup()
  return (
    <DecisionSheet
      icon={<ChevronLeft className="size-6" />}
      iconTone="neutral"
      title={`¿Salir de “${name}”?`}
      onClose={onClose}
      actions={[
        { label: 'Quedarme', onClick: onClose },
        {
          label: 'Salir del grupo',
          tone: 'danger',
          disabled: leave.isPending || netCents !== 0,
          onClick: () =>
            void leave
              .mutateAsync(groupId)
              .then(() => {
                toast.show('Saliste del grupo', { mascotUrl: mascotHappy })
                onDone()
              })
              .catch((e: unknown) => {
                onClose()
                toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
              }),
        },
      ]}
    >
      <p>Dejás de ver el grupo y de recibir avisos. Los demás siguen con sus cuentas.</p>
      {netCents !== 0 && (
        <p className="mt-3 flex gap-2 rounded-[18px] bg-tint-green px-4 py-3 text-[16px]">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {netCents < 0
            ? `Antes de irte tenés que saldar los ${money(-netCents)} que debés.`
            : `Antes de irte, que te paguen los ${money(netCents)} que te deben.`}
        </p>
      )}
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
