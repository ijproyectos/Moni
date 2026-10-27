import { Copy, KeyRound, Upload } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/shared/lib/share'
import { ShareLinkSheet } from './ShareLinkSheet'
import { useToast } from './toastContext'

interface InviteCodeCardProps {
  code: string
  /** e.g. "Caro lo escribe en Moni y entra a la meta." */
  description: string
  codeCaption: string
  link: string
  shareText: string
  /** Inside another card: no border, padding or "Con un código" header. */
  embedded?: boolean
}

/** "Con un código" card: code box plus copy / share-link buttons (screens 145-147, 125-126). */
export function InviteCodeCard({
  code,
  description,
  codeCaption,
  link,
  shareText,
  embedded,
}: InviteCodeCardProps) {
  const toast = useToast()
  const [sharing, setSharing] = useState(false)
  return (
    <div className={embedded ? '' : 'rounded-[24px] border border-sand bg-white p-4'}>
      <div className={embedded ? 'hidden' : 'flex items-start gap-3'}>
        <KeyRound
          aria-hidden="true"
          className="mt-1 size-7 shrink-0 -scale-x-100 text-forest"
          strokeWidth={2}
        />
        <div>
          <p className="text-[19px] font-extrabold leading-6">Con un código</p>
          <p className="text-[15px] leading-5 text-text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-[16px] bg-sand px-4 py-3">
        <span className="select-all font-display text-[22px] font-extrabold tracking-[0.12em]">
          {code}
        </span>
        <span className="text-[14px] text-text-muted">{codeCaption}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copyText(code, toast, 'Código copiado')}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest text-[16px] font-extrabold text-cream"
        >
          <Copy aria-hidden="true" className="size-5" />
          Copiar código
        </button>
        <button
          type="button"
          onClick={() => setSharing(true)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
        >
          <Upload aria-hidden="true" className="size-5" />
          Compartir link
        </button>
      </div>
      {sharing && (
        <ShareLinkSheet
          message={shareText}
          url={link}
          code={code}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}
