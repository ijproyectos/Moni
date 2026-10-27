import { Bell, Copy, MessageSquare, Upload } from 'lucide-react'
import { useState } from 'react'
import { copyText, shareLink } from '@/shared/lib/share'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { cn } from './cn'
import { SectionLabel } from './kit'
import { useToast } from './toastContext'

interface ShareLinkSheetProps {
  title?: string
  /** What the other person receives, without the link. */
  message: string
  /** Full URL. */
  url: string
  /** Optional code to mention under the preview. */
  code?: string
  onClose: () => void
}

// Screens 148-155 — Compartir link / Compartir mi link (and their "link copiado" state).
export function ShareLinkSheet({
  title = 'Compartir link',
  message,
  url,
  code,
  onClose,
}: ShareLinkSheetProps) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const display = url.replace(/^https?:\/\//, '')
  const full = `${message} ${url}`
  const options = [
    {
      label: 'Copiar link',
      icon: Copy,
      onClick: async () => setCopied(await copyText(url, toast, 'Link copiado')),
    },
    {
      label: 'Mensajes',
      icon: MessageSquare,
      onClick: () => window.open(`sms:?&body=${encodeURIComponent(full)}`),
    },
    {
      label: 'Mail',
      icon: Bell,
      onClick: () => window.open(`mailto:?subject=Moni&body=${encodeURIComponent(full)}`),
    },
    {
      label: 'Más apps',
      icon: Upload,
      onClick: () => void shareLink({ url, text: message }, toast),
    },
  ]
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="rounded-[22px] border border-sand bg-white p-4">
        <SectionLabel>Así le llega</SectionLabel>
        <div className="mt-2 rounded-[16px] bg-sand px-4 py-3 text-[16px] leading-6">
          {message}
          <strong className="mt-1 block break-all font-extrabold">{display}</strong>
        </div>
      </div>
      {code && (
        <p className="mt-2 text-center text-[15px] text-text-muted">
          También podés pasarle el código{' '}
          <strong className="font-extrabold text-forest">{code}</strong>
        </p>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => void o.onClick()}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                'flex size-14 items-center justify-center rounded-full',
                i === 0 ? 'bg-forest text-cream' : 'bg-white text-forest',
              )}
            >
              <o.icon aria-hidden="true" className="size-6" />
            </span>
            <span className="text-[14px] font-extrabold">{o.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[14px] leading-5 text-text-muted">
        El link se puede usar por 7 días. Quien lo abre se descarga Moni y entra directo.
      </p>
      <Button className="mt-4" onClick={onClose}>
        {copied ? 'Listo' : 'Cerrar'}
      </Button>
    </BottomSheet>
  )
}
