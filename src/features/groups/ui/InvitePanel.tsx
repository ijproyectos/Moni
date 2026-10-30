import { Copy, MessageCircle, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { copyText, whatsappUrl } from '@/shared/lib/share'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateInvite, useGroupInvites, useRevokeInvite } from '../api/useGroups'
import { isInviteActive } from '../domain/group'
import { inviteLink } from '../domain/groupView'
import { prettyCode } from '../domain/inviteCode'

interface InvitePanelProps {
  groupId: string
  groupName: string
  /** Shows the "Listo" button (invite step right after creating the group). */
  onDone?: () => void
}

const actionClass =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-extrabold aria-disabled:opacity-50 disabled:opacity-50'

/** Invite message the other person receives (name, code and join link). */
function inviteMessage(groupName: string, code: string, link: string): string {
  return `¡Hola! Te invito a mi grupo “${groupName}” en Moni para dividir gastos. Entrá con este link: ${link} o ingresá el código ${prettyCode(code)}.`
}

/**
 * Shows the group's linking code and the ways to send it (WhatsApp, native share, copy). Generates
 * a code when the group has none. Creating or revoking an invite needs a connection.
 */
export function InvitePanel({ groupId, groupName, onDone }: InvitePanelProps) {
  const online = useOnlineStatus()
  const toast = useToast()
  const invites = useGroupInvites(groupId)
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const autoTried = useRef(false)

  const active = (invites.data ?? []).find((i) => isInviteActive(i))
  const code = active?.code ?? null
  const busy = createInvite.isPending || revokeInvite.isPending

  async function generate() {
    setError(null)
    try {
      await createInvite.mutateAsync(groupId)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  async function regenerate() {
    if (!active) return
    setError(null)
    try {
      await revokeInvite.mutateAsync(active.id)
      await createInvite.mutateAsync(groupId)
      setCopied(false)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  // A group without an active code gets one as soon as the list is known (once per panel).
  useEffect(() => {
    if (autoTried.current || !online || !invites.isSuccess || code) return
    autoTried.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, invites.isSuccess, code])

  const link = code ? inviteLink(window.location.origin, code) : ''
  const message = code ? inviteMessage(groupName, code, link) : ''
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    if (!code) return
    const ok = await copyText(code, toast, 'Código copiado')
    setCopied(ok)
  }

  async function share() {
    try {
      await navigator.share({ title: 'Moni', text: message, url: link })
    } catch {
      // Closed the share dialog.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[16px] leading-6 text-text-muted">
        Pasale este código a quien quieras sumar. Lo escribe en Moni (o abre el link) y entra al
        grupo.
      </p>
      <div className="rounded-[20px] bg-sand px-4 py-5 text-center">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
          Código del grupo
        </p>
        {code ? (
          <p
            aria-label={`Código del grupo ${prettyCode(code)}`}
            className="mt-1 select-all font-display text-[32px] font-extrabold tracking-[0.1em]"
          >
            {prettyCode(code)}
          </p>
        ) : (
          <p className="mt-1 font-display text-[22px] font-extrabold text-text-muted">
            {busy || invites.isLoading ? 'Generando…' : 'Sin código activo'}
          </p>
        )}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Código copiado' : ''}
      </span>

      {!code && !busy && online && invites.isSuccess && (
        <Button onClick={() => void generate()}>Generar código</Button>
      )}

      {code && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!online}
            className={cn(actionClass, 'bg-forest text-cream')}
          >
            <Copy aria-hidden="true" className="size-5" />
            {copied ? 'Código copiado' : 'Copiar código'}
          </button>
          {online ? (
            <a
              href={whatsappUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(actionClass, 'bg-lime text-forest')}
            >
              <MessageCircle aria-hidden="true" className="size-5" />
              Enviar por WhatsApp
            </a>
          ) : (
            <button type="button" disabled className={cn(actionClass, 'bg-lime text-forest')}>
              <MessageCircle aria-hidden="true" className="size-5" />
              Enviar por WhatsApp
            </button>
          )}
          {canShare && (
            <button
              type="button"
              onClick={() => void share()}
              disabled={!online}
              className={cn(actionClass, 'border-2 border-sand bg-white')}
            >
              <Upload aria-hidden="true" className="size-5" />
              Compartir
            </button>
          )}
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={!online || busy}
            className="mx-auto flex min-h-11 items-center gap-2 text-[15px] font-extrabold text-text-muted disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Generar un código nuevo
          </button>
        </div>
      )}

      {!online && (
        <p role="status" className="text-center text-sm font-semibold text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}
      {onDone && <Button onClick={onDone}>Listo</Button>}
    </div>
  )
}
