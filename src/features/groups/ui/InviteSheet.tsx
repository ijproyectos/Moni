import { Copy, Share2 } from 'lucide-react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { inviteLink } from '../domain/groupView'

interface InviteSheetProps {
  code: string
  groupName: string
  onClose: () => void
}

/** Shows an invite code big, with copy and (when the browser supports it) native share. */
export function InviteSheet({ code, groupName, onClose }: InviteSheetProps) {
  const toast = useToast()
  const link = inviteLink(window.location.origin, code)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast.show('Código copiado', { mascotUrl: mascotGroup })
    } catch {
      toast.show('No pudimos copiar. Seleccioná el código a mano.', { tone: 'error' })
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: 'Moni',
        text: `Sumate a "${groupName}" en Moni con el código ${code}`,
        url: link,
      })
    } catch {
      // The person closed the share dialog; nothing to report.
    }
  }

  return (
    <BottomSheet title="Invitá a tu gente" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <img src={mascotGroup} alt="" className="size-24" />
        <p className="text-[16px] leading-6 text-text-muted">
          Pasales este código para que entren a {groupName}. Vence en 7 días.
        </p>
        <p
          aria-label={`Código ${code.split('').join(' ')}`}
          className="select-all font-display text-[40px] font-bold tracking-[0.2em] text-forest"
        >
          {code}
        </p>
        <p className="break-all text-sm text-text-muted">{link}</p>
        <div className="flex w-full flex-col gap-2">
          <Button onClick={() => void copy()}>
            <Copy aria-hidden="true" className="mr-2 size-5" />
            Copiar código
          </Button>
          {canShare && (
            <Button variant="dark" onClick={() => void share()}>
              <Share2 aria-hidden="true" className="mr-2 size-5" />
              Compartir
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
